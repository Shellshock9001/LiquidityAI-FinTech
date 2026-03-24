import Database from 'better-sqlite3';
import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'liquidity.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ──────────────────────────── MIGRATIONS ────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pending',
    status TEXT NOT NULL DEFAULT 'pending',
    avatar_initials TEXT NOT NULL DEFAULT '??',
    department TEXT DEFAULT '',
    title TEXT DEFAULT '',
    reason_for_access TEXT DEFAULT '',
    referral_code TEXT DEFAULT '',
    risk_score INTEGER DEFAULT 0,
    risk_factors TEXT DEFAULT '[]',
    denial_reason TEXT DEFAULT '',
    denied_by TEXT DEFAULT '',
    denied_at TEXT,
    password_changed_at TEXT,
    must_reset_password INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_by TEXT,
    approved_at TEXT,
    approved_role TEXT DEFAULT '',
    admin_notes TEXT DEFAULT '',
    suspended_by TEXT,
    suspended_at TEXT,
    suspension_reason TEXT DEFAULT '',
    last_login TEXT,
    login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    metadata TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    refresh_token_hash TEXT,
    ip_address TEXT,
    user_agent TEXT,
    device_label TEXT DEFAULT 'Unknown',
    is_current INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    revoked_at TEXT,
    revoked_by TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    actor_id TEXT,
    actor_email TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    target_email TEXT,
    details TEXT DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    outcome TEXT NOT NULL DEFAULT 'success'
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (role, permission)
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    scopes TEXT DEFAULT '["read"]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    last_used TEXT,
    revoked INTEGER DEFAULT 0,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS security_policies (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT DEFAULT 'SYSTEM'
  );

  CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    invited_by TEXT NOT NULL,
    invited_by_email TEXT,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
 );

  CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY,
    to_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    template TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT DEFAULT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
  CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token_hash);
`);

// ── Safe column additions for existing DBs ──
const addCol = (table, col, def) => {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (_) { }
};
addCol('users', 'department', "TEXT DEFAULT ''");
addCol('users', 'title', "TEXT DEFAULT ''");
addCol('users', 'reason_for_access', "TEXT DEFAULT ''");
addCol('users', 'referral_code', "TEXT DEFAULT ''");
addCol('users', 'risk_score', 'INTEGER DEFAULT 0');
addCol('users', 'risk_factors', "TEXT DEFAULT '[]'");
addCol('users', 'denial_reason', "TEXT DEFAULT ''");
addCol('users', 'denied_by', "TEXT DEFAULT ''");
addCol('users', 'denied_at', 'TEXT');
addCol('users', 'password_changed_at', 'TEXT');
addCol('users', 'must_reset_password', 'INTEGER DEFAULT 0');
addCol('users', 'approved_role', "TEXT DEFAULT ''");
addCol('users', 'admin_notes', "TEXT DEFAULT ''");
addCol('users', 'suspension_reason', "TEXT DEFAULT ''");
addCol('sessions', 'device_label', "TEXT DEFAULT 'Unknown'");
addCol('sessions', 'is_current', 'INTEGER DEFAULT 0');
addCol('sessions', 'last_active', "TEXT NOT NULL DEFAULT (datetime('now'))");
addCol('sessions', 'revoked_by', 'TEXT');

// ──────────────────────────── RBAC ────────────────────────────

const ROLES = {
  'super_admin': [
    'users.list', 'users.read', 'users.create', 'users.update', 'users.delete',
    'users.approve', 'users.suspend', 'users.restore', 'users.change_role', 'users.deny',
    'users.force_reset', 'users.invite',
    'graph.read', 'graph.write',
    'hitl.review', 'hitl.approve',
    'api_keys.manage', 'api_keys.read',
    'audit.read', 'audit.export',
    'settings.manage', 'pipeline.manage', 'llm.manage',
    'sessions.read', 'sessions.revoke',
    'policies.read', 'policies.write',
  ],
  'admin': [
    'users.list', 'users.read', 'users.update',
    'users.approve', 'users.suspend', 'users.restore', 'users.change_role', 'users.deny',
    'users.force_reset', 'users.invite',
    'graph.read', 'graph.write',
    'hitl.review', 'hitl.approve',
    'api_keys.manage', 'api_keys.read',
    'audit.read', 'audit.export',
    'settings.manage', 'pipeline.manage', 'llm.manage',
    'sessions.read', 'sessions.revoke',
    'policies.read',
  ],
  'data_engineer': [
    'users.list', 'users.read',
    'graph.read', 'graph.write',
    'hitl.review', 'hitl.approve',
    'api_keys.manage', 'api_keys.read',
    'audit.read.own',
    'pipeline.manage', 'llm.manage',
    'sessions.read.own',
  ],
  'analyst': [
    'users.list', 'users.read',
    'graph.read',
    'hitl.read',
    'api_keys.read',
    'audit.read.own',
    'sessions.read.own',
  ],
  'data_steward': [
    'users.list', 'users.read',
    'graph.read', 'graph.curate',
    'hitl.review', 'hitl.approve',
    'audit.read.own',
    'sessions.read.own',
  ],
  'auditor': [
    'users.list', 'users.read',
    'graph.audit',
    'audit.read', 'audit.export',
    'sessions.read',
  ],
  'viewer': ['graph.read', 'sessions.read.own'],
  'pending': [],
};

const insertPerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)');
db.transaction(() => {
  for (const [role, perms] of Object.entries(ROLES)) {
    for (const perm of perms) insertPerm.run(role, perm);
  }
})();

// ── Default security policies ──
const insertPolicy = db.prepare('INSERT OR IGNORE INTO security_policies (key, value) VALUES (?, ?)');
const defaultPolicies = {
  'password.min_length': '8',
  'password.require_uppercase': 'true',
  'password.require_lowercase': 'true',
  'password.require_number': 'true',
  'password.require_special': 'true',
  'password.expiry_days': '90',
  'password.history_count': '5',
  'session.timeout_hours': '8',
  'session.max_concurrent': '5',
  'session.refresh_days': '7',
  'lockout.max_attempts': '5',
  'lockout.duration_minutes': '15',
  'lockout.progressive': 'true',
  'access_review.frequency_days': '90',
  'access_review.last_completed': '',
};
for (const [k, v] of Object.entries(defaultPolicies)) insertPolicy.run(k, v);

// ──────────────────────────── SEED ADMIN USERS ────────────────────────────

const seedUsers = [
  {
    email: 'admin@liquidity.ai', password: 'Liquidity2026!',
    displayName: 'Liquidity.ai', role: 'super_admin', initials: 'LQ',
    department: 'Platform Engineering', title: 'Platform Administrator',
  },
];

for (const u of seedUsers) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (!existing) {
    const hash = bcryptjs.hashSync(u.password, 12);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, display_name, role, status, avatar_initials, department, title, approved_by, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(uuidv4(), u.email, hash, u.displayName, u.role, 'active', u.initials, u.department, u.title, 'SYSTEM');

    db.prepare(`
      INSERT INTO audit_log (id, actor_id, actor_email, actor_role, action, target_type, target_email, details, ip_address, outcome)
      VALUES (?, 'SYSTEM', 'SYSTEM', 'system', 'USER_SEEDED', 'user', ?, ?, 'localhost', 'success')
    `).run(uuidv4(), u.email, JSON.stringify({ note: `${u.role} seeded on first boot` }));
  } else {
    // Update password for existing users on re-seed
    const hash = bcryptjs.hashSync(u.password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, u.email);
  }
}

// ──────────────────────────── QUERIES ────────────────────────────

export const queries = {
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getAllUsers: db.prepare(`SELECT id, email, display_name, role, status, avatar_initials, department, title,
    reason_for_access, referral_code, risk_score, risk_factors, denial_reason, denied_by, denied_at,
    created_at, updated_at, approved_by, approved_at, approved_role, admin_notes,
    suspended_by, suspended_at, suspension_reason, last_login, login_attempts, locked_until,
    must_reset_password FROM users ORDER BY created_at DESC`),
  getUsersByStatus: db.prepare(`SELECT id, email, display_name, role, status, avatar_initials, department, title,
    reason_for_access, referral_code, risk_score, risk_factors, denial_reason, denied_by, denied_at,
    created_at, updated_at, approved_by, approved_at, admin_notes FROM users WHERE status = ? ORDER BY risk_score DESC, created_at DESC`),

  createUser: db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, status, avatar_initials, department, title, reason_for_access, referral_code, risk_score, risk_factors)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  updateUserRole: db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?"),
  approveUser: db.prepare("UPDATE users SET status = 'active', role = ?, approved_by = ?, approved_at = datetime('now'), approved_role = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?"),
  denyUser: db.prepare("UPDATE users SET status = 'denied', denial_reason = ?, denied_by = ?, denied_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"),
  suspendUser: db.prepare("UPDATE users SET status = 'suspended', suspended_by = ?, suspended_at = datetime('now'), suspension_reason = ?, updated_at = datetime('now') WHERE id = ?"),
  restoreUser: db.prepare("UPDATE users SET status = 'active', suspended_by = NULL, suspended_at = NULL, suspension_reason = '', updated_at = datetime('now') WHERE id = ?"),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  updateLastLogin: db.prepare("UPDATE users SET last_login = datetime('now'), login_attempts = 0, locked_until = NULL WHERE id = ?"),
  incrementLoginAttempts: db.prepare('UPDATE users SET login_attempts = login_attempts + 1 WHERE id = ?'),
  lockUser: db.prepare("UPDATE users SET locked_until = datetime('now', '+15 minutes') WHERE id = ?"),
  resetLoginAttempts: db.prepare("UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = ?"),
  updatePassword: db.prepare("UPDATE users SET password_hash = ?, password_changed_at = datetime('now'), must_reset_password = 0, updated_at = datetime('now') WHERE id = ?"),
  forceResetPassword: db.prepare("UPDATE users SET must_reset_password = 1, updated_at = datetime('now') WHERE id = ?"),
  updateUserDetails: db.prepare("UPDATE users SET display_name = ?, department = ?, title = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?"),

  // Sessions
  createSession: db.prepare(`INSERT INTO sessions (id, user_id, token_hash, refresh_token_hash, ip_address, user_agent, device_label, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  getSession: db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND revoked = 0'),
  getSessionByRefresh: db.prepare('SELECT * FROM sessions WHERE refresh_token_hash = ? AND revoked = 0'),
  getSessionById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  getActiveSessions: db.prepare('SELECT s.*, u.display_name, u.email, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.revoked = 0 ORDER BY s.last_active DESC'),
  getUserSessions: db.prepare('SELECT * FROM sessions WHERE user_id = ? AND revoked = 0 ORDER BY last_active DESC'),
  revokeSession: db.prepare("UPDATE sessions SET revoked = 1, revoked_at = datetime('now'), revoked_by = ? WHERE id = ?"),
  revokeAllUserSessions: db.prepare("UPDATE sessions SET revoked = 1, revoked_at = datetime('now'), revoked_by = ? WHERE user_id = ? AND revoked = 0"),
  updateSessionActivity: db.prepare("UPDATE sessions SET last_active = datetime('now') WHERE id = ?"),
  cleanExpiredSessions: db.prepare("UPDATE sessions SET revoked = 1, revoked_at = datetime('now') WHERE expires_at < datetime('now') AND revoked = 0"),

  // Audit
  createAuditEntry: db.prepare(`INSERT INTO audit_log (id, actor_id, actor_email, actor_role, action, target_type, target_id, target_email, details, ip_address, user_agent, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),

  // API Keys
  createApiKey: db.prepare(`INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  getApiKeysByUser: db.prepare('SELECT id, name, key_prefix, scopes, created_at, expires_at, last_used, revoked FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'),
  getApiKeyByHash: db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0'),
  revokeApiKey: db.prepare("UPDATE api_keys SET revoked = 1, revoked_at = datetime('now') WHERE id = ? AND user_id = ?"),

  // Policies
  getAllPolicies: db.prepare('SELECT * FROM security_policies ORDER BY key'),
  getPolicy: db.prepare('SELECT value FROM security_policies WHERE key = ?'),
  updatePolicy: db.prepare("UPDATE security_policies SET value = ?, updated_at = datetime('now'), updated_by = ? WHERE key = ?"),

  // Invitations
  createInvitation: db.prepare(`INSERT INTO invitations (id, email, role, invited_by, invited_by_email, token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  getInvitationByToken: db.prepare('SELECT * FROM invitations WHERE token_hash = ? AND used = 0'),
  markInvitationUsed: db.prepare("UPDATE invitations SET used = 1, used_at = datetime('now') WHERE id = ?"),
  getInvitations: db.prepare('SELECT * FROM invitations ORDER BY created_at DESC'),

  getPermissionsForRole: db.prepare('SELECT permission FROM role_permissions WHERE role = ?'),
};

export function logAudit({ actorId, actorEmail, actorRole, action, targetType, targetId, targetEmail, details, ip, userAgent, outcome = 'success' }) {
  queries.createAuditEntry.run(
    uuidv4(), actorId || 'SYSTEM', actorEmail || 'SYSTEM', actorRole || 'system',
    action, targetType || null, targetId || null, targetEmail || null,
    JSON.stringify(details || {}), ip || 'unknown', userAgent || 'unknown', outcome
  );
}

export function queryAuditLog({ page = 1, limit = 50, action, actor, target, from, to }) {
  let where = [], params = [];
  if (action) { where.push('action = ?'); params.push(action); }
  if (actor) { where.push('(actor_email LIKE ? OR actor_id = ?)'); params.push(`%${actor}%`, actor); }
  if (target) { where.push('(target_email LIKE ? OR target_id = ?)'); params.push(`%${target}%`, target); }
  if (from) { where.push('timestamp >= ?'); params.push(from); }
  if (to) { where.push('timestamp <= ?'); params.push(to); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (page - 1) * limit;
  const rows = db.prepare(`SELECT * FROM audit_log ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`).get(...params);
  return { entries: rows, total: total.count, page, limit, pages: Math.ceil(total.count / limit) };
}

export function getPolicyValue(key, fallback = '') {
  const row = queries.getPolicy.get(key);
  return row ? row.value : fallback;
}

export { db, ROLES };
export default db;
