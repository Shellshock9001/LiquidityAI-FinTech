import { Router } from 'express';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queries, logAudit } from '../db.js';
import { authenticate, generateTokens, hashToken } from '../middleware/auth.js';
import { computeRiskScore } from '../riskEngine.js';
import { sendSecurityAlert } from '../lib/email.js';

const router = Router();

// Parse device from User-Agent
function parseDevice(ua) {
    if (!ua) return 'Unknown';
    if (/mobile|android|iphone/i.test(ua)) return 'Mobile';
    if (/tablet|ipad/i.test(ua)) return 'Tablet';
    if (/windows/i.test(ua)) return 'Windows';
    if (/macintosh|mac os/i.test(ua)) return 'macOS';
    if (/linux/i.test(ua)) return 'Linux';
    return 'Browser';
}

// ── REGISTER ──
router.post('/register', (req, res) => {
    try {
        const { displayName, email, password, department, title, reasonForAccess, referralCode } = req.body;

        if (!displayName || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        // Password complexity
        const pwErrors = [];
        if (password.length < 8) pwErrors.push('Minimum 8 characters');
        if (!/[A-Z]/.test(password)) pwErrors.push('Requires uppercase letter');
        if (!/[a-z]/.test(password)) pwErrors.push('Requires lowercase letter');
        if (!/[0-9]/.test(password)) pwErrors.push('Requires number');
        if (!/[^A-Za-z0-9]/.test(password)) pwErrors.push('Requires special character');
        if (pwErrors.length > 0) return res.status(400).json({ error: 'Password does not meet complexity requirements', details: pwErrors });

        // Duplicate check
        const existing = queries.getUserByEmail.get(email.toLowerCase());
        if (existing) return res.status(409).json({ error: 'An account with this email already exists', code: 'DUPLICATE' });

        // Risk scoring
        const { score, factors, level } = computeRiskScore({ email, department, title, reasonForAccess, referralCode });

        const id = uuidv4();
        const hash = bcryptjs.hashSync(password, 12);
        const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        queries.createUser.run(
            id, email.toLowerCase(), hash, displayName, 'pending', 'pending', initials,
            department || '', title || '', reasonForAccess || '', referralCode || '',
            score, JSON.stringify(factors)
        );

        logAudit({
            actorId: id, actorEmail: email, actorRole: 'pending',
            action: 'USER_REGISTERED', targetType: 'user', targetId: id, targetEmail: email,
            details: { displayName, department, title, riskScore: score, riskLevel: level },
            ip: req.ip, userAgent: req.get('user-agent'),
        });

        res.status(201).json({
            message: 'Account created. Your request is pending admin approval.',
            riskLevel: level,
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ── LOGIN ──
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const user = queries.getUserByEmail.get(email.toLowerCase());
        if (!user) {
            logAudit({ action: 'LOGIN_FAILED', targetType: 'user', targetEmail: email, details: { reason: 'User not found' }, ip: req.ip, userAgent: req.get('user-agent'), outcome: 'failure' });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check lockout
        if (user.locked_until && new Date(user.locked_until + 'Z') > new Date()) {
            const minutesLeft = Math.ceil((new Date(user.locked_until + 'Z') - new Date()) / 60000);
            logAudit({ actorId: user.id, actorEmail: user.email, action: 'LOGIN_BLOCKED', details: { reason: 'Account locked', minutesLeft }, ip: req.ip, outcome: 'failure' });
            return res.status(423).json({ error: 'Account temporarily locked', code: 'LOCKED', minutesLeft });
        }

        // Password check
        if (!bcryptjs.compareSync(password, user.password_hash)) {
            queries.incrementLoginAttempts.run(user.id);
            const attempts = user.login_attempts + 1;

            if (attempts >= 5) {
                queries.lockUser.run(user.id);
                logAudit({ actorId: user.id, actorEmail: user.email, action: 'ACCOUNT_LOCKED', targetType: 'user', targetId: user.id, targetEmail: user.email, details: { attempts }, ip: req.ip, outcome: 'failure' });

sendSecurityAlert(
  user.email,
  user.display_name,
  `Your account was locked after 5 failed login attempts. IP: ${req.ip}`
).catch(err => console.error('Email failed', err.message));

                return res.status(423).json({ error: 'Account locked after 5 failed attempts', code: 'LOCKED', minutesLeft: 15 });
            }

            logAudit({ actorId: user.id, actorEmail: user.email, action: 'LOGIN_FAILED', details: { reason: 'Wrong password', attempts }, ip: req.ip, outcome: 'failure' });
            return res.status(401).json({ error: 'Invalid credentials', attemptsRemaining: 5 - attempts });
        }

        // Status checks
        if (user.status === 'pending') return res.status(403).json({ error: 'Account pending approval', code: 'PENDING' });
        if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended. Contact an administrator.', code: 'SUSPENDED' });
        if (user.status === 'denied') return res.status(403).json({ error: 'Access request was denied', code: 'DENIED' });

        // Success — create session
        const { accessToken, refreshToken, accessHash, refreshHash, expiresAt } = generateTokens(user);
        const sessionId = uuidv4();
        const deviceLabel = parseDevice(req.get('user-agent'));

        queries.createSession.run(sessionId, user.id, accessHash, refreshHash, req.ip, req.get('user-agent'), deviceLabel, expiresAt);
        queries.updateLastLogin.run(user.id);

        logAudit({ actorId: user.id, actorEmail: user.email, actorRole: user.role, action: 'LOGIN_SUCCESS', targetType: 'user', targetId: user.id, targetEmail: user.email, ip: req.ip, userAgent: req.get('user-agent') });

        res.json({
            accessToken, refreshToken,
            user: {
                id: user.id, email: user.email, displayName: user.display_name,
                role: user.role, status: user.status, avatarInitials: user.avatar_initials,
                department: user.department, title: user.title,
                mustResetPassword: user.must_reset_password === 1,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// ── LOGOUT ──
router.post('/logout', authenticate, (req, res) => {
    try {
        const tokenHash = hashToken(req.headers.authorization?.split(' ')[1]);
        const session = queries.getSession.get(tokenHash);
        if (session) queries.revokeSession.run(req.user.id, session.id);

        logAudit({ actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role, action: 'LOGOUT', ip: req.ip });
        res.json({ message: 'Logged out' });
    } catch (err) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

// ── REFRESH TOKEN ──
router.post('/refresh', (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

        const refreshHash = hashToken(refreshToken);
        const session = queries.getSessionByRefresh.get(refreshHash);
        if (!session) return res.status(401).json({ error: 'Invalid refresh token' });

        const user = queries.getUserById.get(session.user_id);
        if (!user || user.status !== 'active') return res.status(401).json({ error: 'Account inactive' });

        // Revoke old session
        queries.revokeSession.run(user.id, session.id);

        // Issue new tokens
        const tokens = generateTokens(user);
        const newSessionId = uuidv4();
        const deviceLabel = parseDevice(req.get('user-agent'));
        queries.createSession.run(newSessionId, user.id, tokens.accessHash, tokens.refreshHash, req.ip, req.get('user-agent'), deviceLabel, tokens.expiresAt);

        res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    } catch (err) {
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// ── ME ──
router.get('/me', authenticate, (req, res) => {
    const user = queries.getUserById.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
        id: user.id, email: user.email, displayName: user.display_name,
        role: user.role, status: user.status, avatarInitials: user.avatar_initials,
        department: user.department, title: user.title,
        createdAt: user.created_at, approvedBy: user.approved_by, approvedAt: user.approved_at,
        lastLogin: user.last_login, mustResetPassword: user.must_reset_password === 1,
        passwordChangedAt: user.password_changed_at,
    });
});

// ── CHANGE PASSWORD ──
router.put('/password', authenticate, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });

        const user = queries.getUserById.get(req.user.id);
        if (!bcryptjs.compareSync(currentPassword, user.password_hash)) {
            logAudit({ actorId: user.id, actorEmail: user.email, action: 'PASSWORD_CHANGE_FAILED', details: { reason: 'Wrong current password' }, ip: req.ip, outcome: 'failure' });
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Complexity
        const pwErrors = [];
        if (newPassword.length < 8) pwErrors.push('Minimum 8 characters');
        if (!/[A-Z]/.test(newPassword)) pwErrors.push('Requires uppercase letter');
        if (!/[a-z]/.test(newPassword)) pwErrors.push('Requires lowercase letter');
        if (!/[0-9]/.test(newPassword)) pwErrors.push('Requires number');
        if (!/[^A-Za-z0-9]/.test(newPassword)) pwErrors.push('Requires special character');
        if (pwErrors.length > 0) return res.status(400).json({ error: 'Password does not meet requirements', details: pwErrors });

        // Can't reuse same password
        if (bcryptjs.compareSync(newPassword, user.password_hash)) {
            return res.status(400).json({ error: 'New password must be different from current password' });
        }

        const hash = bcryptjs.hashSync(newPassword, 12);
        queries.updatePassword.run(hash, user.id);

        logAudit({ actorId: user.id, actorEmail: user.email, actorRole: user.role, action: 'PASSWORD_CHANGED', targetType: 'user', targetId: user.id, ip: req.ip });

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Password change failed' });
    }
});

export default router;
