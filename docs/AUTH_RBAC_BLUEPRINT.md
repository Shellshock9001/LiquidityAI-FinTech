# Auth/RBAC Integration Blueprint

### A Complete Enterprise Security Layer — Ready to Integrate Into Any SaaS Application

**Version:** 1.0
**Architecture:** Express.js + SQLite (easily adaptable to PostgreSQL, MySQL, or MongoDB)
**License:** Commercial — includes full source code and integration rights

---

## What You Get

This is not a tutorial. It's a **production-tested, auditable security layer** you can drop into any Node.js/Express application. Every component has been code-audited against OWASP Top 10 and NIST 800-63B standards.

### Package Contents

```
auth-rbac-blueprint/
├── middleware/
│   ├── auth.js          # JWT verification, token hashing, session validation
│   └── rbac.js          # Role hierarchy, permission middleware, escalation prevention
├── routes/
│   ├── authRoutes.js    # Login, register, logout, refresh, password change
│   ├── userRoutes.js    # User CRUD, suspend, restore, approve, deny, force-reset
│   ├── sessionRoutes.js # Session listing, individual/bulk revocation
│   ├── apiKeyRoutes.js  # Scoped API key creation, revocation
│   ├── policyRoutes.js  # Security policy management
│   └── auditRoutes.js   # Immutable audit log queries with pagination
├── db.js                # Schema, migrations, prepared statements, seeding
├── riskEngine.js        # Registration risk scoring (0-100)
└── docs/
    ├── SECURITY_AUDIT_REPORT.md   # Full code audit with grades
    └── INTEGRATION_GUIDE.md       # Step-by-step integration instructions
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                     │
└──────────────────────────┬──────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Rate Limiter │ ← 10 auth/15min, 100 api/min
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Helmet    │ ← HSTS, X-Frame, CSP headers
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    CORS     │ ← Origin-locked
                    └──────┬──────┘
                           │
               ┌───────────▼───────────┐
               │  Public Routes        │ ← /login, /register, /health
               │  (no auth required)   │
               └───────────┬───────────┘
                           │
                    ┌──────▼──────┐
                    │ authenticate│ ← JWT verify → session lookup → user load
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │   requirePermission()   │ ← 'users.list', 'audit.read'
              │   requireRole()         │ ← 'super_admin', 'admin'
              │   preventEscalation()   │ ← can't assign role ≥ own
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │   Handler   │ ← Business logic
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  logAudit() │ ← Immutable event recording
                    └─────────────┘
```

---

## Module 1: Authentication

### How It Works

```
User Login                              Server
─────────                              ──────
   │                                      │
   ├─── POST /login {email, pwd} ──────► │ 1. Find user by email (lowercase)
   │                                      │ 2. Check lockout (locked_until)
   │                                      │ 3. bcrypt.compare(pwd, hash)
   │                                      │    ├── FAIL: increment attempts
   │                                      │    │   ├── attempts ≥ 5: LOCK 15min
   │                                      │    │   └── return attemptsRemaining
   │                                      │    └── PASS: continue
   │                                      │ 4. Check status (pending/suspended/denied)
   │                                      │ 5. Generate JWT access (8h) + refresh (7d)
   │                                      │ 6. Hash both tokens (SHA-256)
   │                                      │ 7. Create session (hash, IP, UA, device)
   │                                      │ 8. Reset login_attempts, update last_login
   │                                      │ 9. Log AUDIT: LOGIN_SUCCESS
   │ ◄──── {accessToken, refreshToken} ── │
   │                                      │
```

### Token Design Decisions

| Decision | Rationale |
|----------|-----------|
| **8-hour access token** | Long enough for a full workday, short enough to limit exposure |
| **7-day refresh token** | Users don't need to re-login every day, but still expire weekly |
| **SHA-256 token hashing** | Even if DB is compromised, tokens can't be extracted and replayed |
| **Session-backed validation** | Solves the JWT revocation problem — revoking a session instantly invalidates the token |
| **Minimal refresh payload** | Refresh token contains only `{id, type}` — no sensitive data |
| **Rotation on refresh** | Old session revoked, new one created — prevents token replay |

### Integration Points

```javascript
// Protect any route
import { authenticate } from './middleware/auth.js';

router.get('/protected', authenticate, (req, res) => {
    // req.user = { id, email, role, displayName, status, avatarInitials }
    // req.sessionId = current session ID
    // req.tokenHash = SHA-256 of the access token
    res.json({ message: `Hello ${req.user.displayName}` });
});
```

---

## Module 2: Role-Based Access Control (RBAC)

### Role Hierarchy

```
Level 8 ─── SUPER ADMIN ─── Can do everything, including:
   │                         • Delete users
   │                         • Manage security policies
   │                         • Export audit logs
   │
Level 7 ─── ADMIN ────────── Everything except:
   │                         • Delete users
   │                         • Modify policies
   │
Level 5 ─── DATA ENGINEER ── Pipeline + LLM management
   │                         Read-only users
   │
Level 4 ─── DATA STEWARD ─── Graph curation, HITL review
   │
Level 3 ─── ANALYST ──────── Read-only data access
   │
Level 2 ─── AUDITOR ──────── Audit + compliance only
   │
Level 1 ─── VIEWER ────────── Read-only graph
   │
Level 0 ─── PENDING ──────── Zero permissions
```

### Permission System

Permissions follow a `resource.action` naming convention:

```javascript
// 30+ permissions organized by resource
const ROLES = {
    'super_admin': [
        'users.list', 'users.read', 'users.create', 'users.update', 'users.delete',
        'users.approve', 'users.suspend', 'users.restore', 'users.change_role',
        'users.deny', 'users.force_reset', 'users.invite',
        'graph.read', 'graph.write',
        'hitl.review', 'hitl.approve',
        'api_keys.manage', 'api_keys.read',
        'audit.read', 'audit.export',
        'settings.manage', 'pipeline.manage', 'llm.manage',
        'sessions.read', 'sessions.revoke',
        'policies.read', 'policies.write',
    ],
    // ... each role gets a carefully curated subset
};
```

### Middleware Usage

```javascript
import { requirePermission, requireRole, preventEscalation } from './middleware/rbac.js';

// Permission-based (recommended — granular)
router.get('/users', authenticate, requirePermission('users.list'), listUsers);
router.put('/users/:id/role', authenticate, requirePermission('users.change_role'), preventEscalation, changeRole);

// Role-based (for coarse checks)
router.delete('/users/:id', authenticate, requireRole('super_admin'), deleteUser);
```

### Escalation Prevention

```javascript
// A user with role level 7 (admin) tries to assign role level 8 (super_admin)
// → 403 "Cannot assign a role equal to or higher than your own"

export function preventEscalation(req, res, next) {
    const actorLevel = getRoleLevel(req.user.role);     // e.g., 7
    const targetRole = req.body.role;                    // e.g., 'super_admin'
    if (targetRole && getRoleLevel(targetRole) >= actorLevel) {
        return res.status(403).json({
            error: 'Cannot assign a role equal to or higher than your own',
            code: 'ROLE_ESCALATION'
        });
    }
    next();
}
```

### How to Add a Custom Role

```javascript
// 1. Add to ROLES object in db.js
'custom_role': ['graph.read', 'pipeline.manage', 'your_custom.permission'],

// 2. Add to ROLE_HIERARCHY in rbac.js
'custom_role': 6,  // between admin (7) and data_engineer (5)

// 3. Permissions are auto-seeded to role_permissions table on next boot
```

---

## Module 3: Risk-Scored Registration

### Scoring Factors

```
Registration Form
       │
       ▼
┌──────────────────────────────────────┐
│         RISK SCORING ENGINE          │
│                                      │
│  Email Domain Analysis:              │
│    ├── Disposable (mailinator): +25  │
│    ├── Generic (gmail):         +10  │
│    └── Organization (corp.com):  -5  │
│                                      │
│  Profile Completeness:               │
│    ├── No department:           +15  │
│    ├── No title:                +10  │
│    └── Both provided:            0   │
│                                      │
│  Access Reason Quality:              │
│    ├── Missing/short (<10 chars):+15 │
│    ├── Suspicious keywords:     +15  │
│    └── Detailed (>30 chars):     -5  │
│                                      │
│  Referral:                           │
│    ├── No referral code:        +20  │
│    └── Valid code:              -20  │
│                                      │
│  Final Score: clamp(0-100)           │
│    ├── 0-30:  LOW (green)            │
│    ├── 31-60: MEDIUM (yellow)        │
│    └── 61-100: HIGH (red)            │
└──────────────────────────────────────┘
       │
       ▼
Admin sees score + factors in Approval Queue
```

### How to Customize

```javascript
// Add your own scoring factors in riskEngine.js:

// IP geolocation check
if (isHighRiskCountry(ipAddress)) {
    score += 20;
    factors.push({ signal: 'High-risk country', points: 20, severity: 'high' });
}

// Email age check (via API)
if (emailAge < 30) { // days
    score += 15;
    factors.push({ signal: 'New email account', points: 15, severity: 'medium' });
}
```

---

## Module 4: Session Management

### Session Lifecycle

```
Login ──► Session Created (hash, IP, UA, device, expires) ──► Active
                                                                  │
                  ┌──────────── Every Request ──────────────┐    │
                  │ 1. Verify JWT                           │    │
                  │ 2. Lookup session by token hash         │    │
                  │ 3. Check session not revoked            │    │
                  │ 4. Update last_active                   │    │
                  │ 5. Load fresh user from DB              │    │
                  │ 6. Check user status is 'active'        │    │
                  └─────────────────────────────────────────┘    │
                                                                  │
Admin Revokes ──► Session revoked (soft-delete)              ──► Dead
Token Expires ──► Session cleanup job                        ──► Dead
User Deleted  ──► CASCADE delete sessions                    ──► Gone
```

### API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/sessions` | JWT + `sessions.read` | List all active sessions (admin), or own sessions |
| `DELETE` | `/api/sessions/:id` | JWT + `sessions.revoke` | Revoke a single session |
| `DELETE` | `/api/sessions/user/:id/all` | JWT + `sessions.revoke` | Nuclear option — revoke ALL sessions for a user |

---

## Module 5: API Key Management

### Key Generation Flow

```
POST /api/api-keys { name: "CI Pipeline", scopes: ["read", "write"] }
       │
       ▼
Generate: Liquidity.ai_sk_ + 32 random hex chars
       │
       ├── Return full key to user (SHOWN ONCE, never stored)
       ├── Store SHA-256 hash in api_keys table
       └── Store first 8 chars as key_prefix for identification
```

### Key Format

```
Liquidity.ai_sk_a1b2c3d4e5f6...  (full key — user sees this once)
Liquidity.ai_sk_a1b2c3d4...       (prefix — shown in dashboard for identification)
SHA-256(full_key)           (hash — stored in database)
```

---

## Module 6: Immutable Audit Logging

### Event Schema

```javascript
{
    id:           "uuid-v4",
    timestamp:    "2026-03-05T23:14:22.000Z",
    actor_id:     "uuid of who did it",
    actor_email:  "their email",
    actor_role:   "their role at time of action",
    action:       "USER_APPROVED",
    target_type:  "user",
    target_id:    "uuid of who it was done to",
    target_email: "their email",
    details:      { "role": "analyst", "notes": "Verified identity" },
    ip_address:   "192.168.1.5",
    user_agent:   "Mozilla/5.0...",
    outcome:      "success"
}
```

### Tracked Events

| Event | When | Details Captured |
|-------|------|-----------------|
| `USER_REGISTERED` | New signup | displayName, department, riskScore, riskLevel |
| `LOGIN_SUCCESS` | Successful login | — |
| `LOGIN_FAILED` | Wrong password | reason, attempts count |
| `LOGIN_BLOCKED` | Locked account tries to login | minutesLeft |
| `ACCOUNT_LOCKED` | 5th failed attempt | attempts count |
| `USER_APPROVED` | Admin approves signup | role, notes |
| `USER_DENIED` | Admin denies signup | reason |
| `USER_SUSPENDED` | Admin suspends user | reason |
| `USER_RESTORED` | Admin restores user | — |
| `ROLE_CHANGED` | Admin changes user role | oldRole, newRole |
| `PASSWORD_CHANGED` | User changes password | — |
| `PASSWORD_CHANGE_FAILED` | Wrong current password | reason |
| `FORCE_RESET_REQUIRED` | Admin forces password reset | — |
| `USER_DELETED` | Super admin deletes user | email |
| `USER_DETAILS_UPDATED` | Admin edits user info | changes |
| `SESSION_REVOKED` | Session terminated | sessionId |
| `ALL_SESSIONS_REVOKED` | All user sessions killed | count |
| `API_KEY_CREATED` | New API key generated | name, prefix, scopes |
| `API_KEY_REVOKED` | API key revoked | name, prefix |
| `POLICY_UPDATED` | Security policy changed | key, oldValue, newValue |
| `LOGOUT` | User logs out | — |

### Querying

```javascript
// The audit log supports filtered, paginated queries
GET /api/audit?action=LOGIN_FAILED&from=2026-03-01&to=2026-03-05&page=1&limit=50

// Returns: { entries: [...], total: 142, page: 1, pages: 3 }
```

---

## Module 7: Security Policies

### Configurable Policies

| Policy Key | Default | Description |
|-----------|---------|-------------|
| `password.min_length` | 8 | Minimum password length |
| `password.require_uppercase` | true | Must contain A-Z |
| `password.require_lowercase` | true | Must contain a-z |
| `password.require_number` | true | Must contain 0-9 |
| `password.require_special` | true | Must contain special chars |
| `password.expiry_days` | 90 | Force password change after N days |
| `password.history_count` | 5 | Prevent reusing last N passwords |
| `session.timeout_hours` | 8 | Session expiry duration |
| `session.max_concurrent` | 5 | Max simultaneous sessions per user |
| `session.refresh_days` | 7 | Refresh token lifetime |
| `lockout.max_attempts` | 5 | Failed logins before lockout |
| `lockout.duration_minutes` | 15 | Lockout duration |
| `lockout.progressive` | true | Increase lockout on repeated lockouts |
| `access_review.frequency_days` | 90 | Required access review frequency |

---

## Database Schema (ERD)

```
┌──────────────────┐       ┌──────────────────┐
│      users       │       │    sessions      │
├──────────────────┤       ├──────────────────┤
│ id (PK, UUID)    │──┐    │ id (PK, UUID)    │
│ email (UNIQUE)   │  │    │ user_id (FK) ────┤──── CASCADE DELETE
│ password_hash    │  │    │ token_hash       │
│ display_name     │  │    │ refresh_hash     │
│ role             │  │    │ ip_address       │
│ status           │  │    │ user_agent       │
│ department       │  │    │ device_label     │
│ title            │  │    │ created_at       │
│ risk_score       │  │    │ last_active      │
│ risk_factors     │  │    │ expires_at       │
│ login_attempts   │  │    │ revoked          │
│ locked_until     │  │    │ revoked_at       │
│ must_reset_pw    │  │    │ revoked_by       │
│ approved_by      │  │    └──────────────────┘
│ admin_notes      │  │
│ created_at       │  │    ┌──────────────────┐
│ last_login       │  │    │    api_keys      │
└──────────────────┘  │    ├──────────────────┤
                      │    │ id (PK, UUID)    │
                      ├───►│ user_id (FK) ────┤──── CASCADE DELETE
                      │    │ name             │
                      │    │ key_hash         │
                      │    │ key_prefix       │
                      │    │ scopes           │
                      │    │ created_at       │
                      │    │ expires_at       │
                      │    │ revoked          │
                      │    └──────────────────┘
                      │
                      │    ┌──────────────────┐
                      │    │   audit_log      │
                      │    ├──────────────────┤
                      │    │ id (PK, UUID)    │
                      │    │ timestamp        │
                      │    │ actor_id         │
                      │    │ actor_email      │
                      │    │ actor_role       │
                      └───►│ action           │
                           │ target_type      │
                           │ target_id        │
                           │ target_email     │
                           │ details (JSON)   │
                           │ ip_address       │
                           │ outcome          │
                           └──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│ role_permissions │       │security_policies │
├──────────────────┤       ├──────────────────┤
│ role (PK)        │       │ key (PK)         │
│ permission (PK)  │       │ value            │
└──────────────────┘       │ updated_at       │
                           │ updated_by       │
                           └──────────────────┘
```

### Indexes (Performance Optimized)

```sql
idx_users_email       ON users(email)        -- Login lookup
idx_users_status      ON users(status)       -- Filter by status
idx_users_role        ON users(role)         -- Filter by role
idx_sessions_user     ON sessions(user_id)   -- User's sessions
idx_sessions_token    ON sessions(token_hash) -- Auth middleware (every request)
idx_audit_timestamp   ON audit_log(timestamp) -- Date range queries
idx_audit_actor       ON audit_log(actor_id)  -- "What did user X do?"
idx_audit_action      ON audit_log(action)    -- "Show all LOGIN_FAILED"
idx_audit_target      ON audit_log(target_id) -- "What happened to user Y?"
idx_api_keys_user     ON api_keys(user_id)   -- User's API keys
```

---

## Integration Checklist

For anyone integrating this into a new project:

### Step 1: Install Dependencies
```bash
npm install express better-sqlite3 bcryptjs jsonwebtoken uuid cors helmet express-rate-limit
```

### Step 2: Copy Files
Copy the entire `server/` directory into your project.

### Step 3: Set Environment Variables
```bash
JWT_SECRET=your-unique-64-char-secret-here
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-frontend.com
DATA_DIR=./data
```

### Step 4: Mount Routes
```javascript
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import apiKeyRoutes from './routes/apiKeyRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import policyRoutes from './routes/policyRoutes.js';

app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/sessions', authenticate, sessionRoutes);
app.use('/api/api-keys', authenticate, apiKeyRoutes);
app.use('/api/audit', authenticate, auditRoutes);
app.use('/api/policies', authenticate, policyRoutes);
```

### Step 5: Protect Your Routes
```javascript
import { authenticate } from './middleware/auth.js';
import { requirePermission, preventEscalation } from './middleware/rbac.js';

// Your custom routes
router.get('/my-data', authenticate, requirePermission('data.read'), handler);
router.post('/my-data', authenticate, requirePermission('data.write'), handler);
```

### Step 6: Customize Roles
Edit the `ROLES` object in `db.js` to match your application's permission model.

### Step 7: Customize Risk Scoring
Edit `riskEngine.js` to add factors specific to your domain.

---

## Adapting to Other Databases

### PostgreSQL
Replace `better-sqlite3` with `pg`:
- Change `db.prepare().get()` → `pool.query()` with `LIMIT 1`
- Change `db.prepare().all()` → `pool.query()`
- Change `db.prepare().run()` → `pool.query()`
- Replace `datetime('now')` → `NOW()`
- Replace `TEXT` → `VARCHAR(255)` where appropriate

### MongoDB
- Replace tables with collections
- Replace prepared statements with Mongoose schemas
- Store audit log in a capped collection (natural append-only behavior)
- Use MongoDB's TTL indexes for session expiry

### MySQL
- Nearly identical to SQLite — replace `datetime('now')` → `NOW()`
- Add `ENGINE=InnoDB` for foreign key support
- Replace `TEXT` with `VARCHAR(255)` for indexed columns

---

## Compliance Mapping

| SOC 2 Control | How This System Addresses It |
|---------------|------------------------------|
| **CC6.1** — Logical access | RBAC with 7 roles, 30+ permissions, escalation prevention |
| **CC6.2** — Access provisioning | Risk-scored registration, admin approval queue |
| **CC6.3** — Access removal | User suspension, session revocation, account deletion |
| **CC6.6** — System monitoring | Immutable audit log, IP tracking, failed login monitoring |
| **CC6.7** — Access changes | Role change audit trail, admin notes, approval records |
| **CC6.8** — Unauthorized access prevention | Account lockout, rate limiting, password complexity |
| **CC7.1** — Security monitoring | Audit log with 20+ event types, filterable queries |
| **CC7.2** — Anomaly detection | Risk scoring engine, suspicious keyword detection |
| **CC8.1** — Change management | Policy versioning, audit trail for policy changes |

---

## Pricing & Licensing

| License Tier | Price | Includes |
|-------------|:-----:|---------|
| **Source Code Only** | $3,000 | Full source code, integration guide, 30 days email support |
| **Source + Customization** | $5,000 | Above + role/permission customization to your domain |
| **Full Integration** | $8,000 – $15,000 | Above + integrated into your existing codebase, tested, deployed |
| **Enterprise** | Custom | Multi-tenant support, SSO/SAML, custom compliance reports |

---

*Built with ❤️ by the Liquidity.ai team. Every line audited. Every decision documented.*
