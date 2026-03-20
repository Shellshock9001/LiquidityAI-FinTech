import { sendSignupApproved, sendSignupDenied, sendPasswordReset } from '../lib/email.js';
import { Router } from 'express';
import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { queries, ROLES, logAudit } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, ROLE_HIERARCHY } from '../middleware/rbac.js';

const router = Router();

// List users (with search + filters)
router.get('/', authenticate, requirePermission('users.list'), (req, res) => {
    try {
        const { status, role, q } = req.query;

        let users;
        if (status) {
            users = queries.getUsersByStatus.all(status);
        } else {
            users = queries.getAllUsers.all();
        }

        // Filter by role
        if (role) users = users.filter(u => u.role === role);

        // Search by name or email
        if (q) {
            const s = q.toLowerCase();
            users = users.filter(u =>
                u.display_name.toLowerCase().includes(s) ||
                u.email.toLowerCase().includes(s) ||
                (u.department || '').toLowerCase().includes(s) ||
                (u.title || '').toLowerCase().includes(s)
            );
        }

        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list users' });
    }
});

// Get single user
router.get('/meta/roles', authenticate, (req, res) => {
    res.json({ roles: Object.keys(ROLES), hierarchy: ROLE_HIERARCHY });
});

router.get('/:id', authenticate, requirePermission('users.read'), (req, res) => {
    const user = queries.getUserById.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password_hash, ...safe } = user;
    res.json(safe);
});

// Approve user
router.patch('/:id/approve', authenticate, requirePermission('users.approve'), (req, res) => {
    try {
        const { role = 'viewer', notes = '' } = req.body;
        const target = queries.getUserById.get(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.status !== 'pending' && target.status !== 'denied') return res.status(400).json({ error: 'User is not pending or denied' });

        // Can't assign role >= own
        const actorLevel = ROLE_HIERARCHY[req.user.role] || 0;
        const targetLevel = ROLE_HIERARCHY[role] || 0;
        if (targetLevel >= actorLevel) return res.status(403).json({ error: 'Cannot assign a role equal to or above your own' });

        queries.approveUser.run(role, req.user.email, role, notes, req.params.id);

        logAudit({
            actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
            action: 'USER_APPROVED', targetType: 'user', targetId: target.id, targetEmail: target.email,
            details: { assignedRole: role, notes, riskScore: target.risk_score },
            ip: req.ip,
        });

sendSignupApproved(target.email, target.display_name).catch(err =>
  console.error('Email failed:', err.message)
);
res.json({ message: `User approved as ${role}` });

        res.json({ message: `User approved as ${role}` });
    } catch (err) {
        res.status(500).json({ error: 'Approval failed' });
    }
});

// Deny user (requires reason)
router.patch('/:id/deny', authenticate, requirePermission('users.approve'), (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason || reason.trim().length < 5) return res.status(400).json({ error: 'Denial reason is required (min 5 characters)' });

        const target = queries.getUserById.get(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.status !== 'pending') return res.status(400).json({ error: 'User is not pending' });

        queries.denyUser.run(reason, req.user.email, req.params.id);

        logAudit({
            actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
            action: 'USER_DENIED', targetType: 'user', targetId: target.id, targetEmail: target.email,
            details: { reason, riskScore: target.risk_score },
            ip: req.ip,
        });

sendSignupDenied(target.email, target.display_name, reason).catch(err =>
  console.error('Email failed:', err.message)
);
res.json({ message: 'User denied' });

sendSignupDenied(target.email, target.display_name, reason).catch(err =>
  console.error('Email failed:', err.message)
);
res.json({ message: 'User denied' });

        res.json({ message: 'User denied' });
    } catch (err) {
        res.status(500).json({ error: 'Denial failed' });
    }
});

// Change role
router.patch('/:id/role', authenticate, requirePermission('users.change_role'), (req, res) => {
    try {
        const { role } = req.body;
        if (!role || !ROLES[role]) return res.status(400).json({ error: 'Invalid role' });

        const target = queries.getUserById.get(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.id === req.user.id) return res.status(403).json({ error: 'Cannot change your own role' });

        const actorLevel = ROLE_HIERARCHY[req.user.role] || 0;
        const targetCurrentLevel = ROLE_HIERARCHY[target.role] || 0;
        const newRoleLevel = ROLE_HIERARCHY[role] || 0;

        if (targetCurrentLevel >= actorLevel) return res.status(403).json({ error: 'Cannot modify a user with equal or higher rank' });
        if (newRoleLevel >= actorLevel) return res.status(403).json({ error: 'Cannot assign a role equal to or above your own' });

        const oldRole = target.role;
        queries.updateUserRole.run(role, req.params.id);

        logAudit({
            actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
            action: 'ROLE_CHANGED', targetType: 'user', targetId: target.id, targetEmail: target.email,
            details: { oldRole, newRole: role },
            ip: req.ip,
        });

        res.json({ message: `Role changed from ${oldRole} to ${role}` });
    } catch (err) {
        res.status(500).json({ error: 'Role change failed' });
    }
});

// Suspend
router.patch('/:id/suspend', authenticate, requirePermission('users.suspend'), (req, res) => {
    try {
        const { reason = '' } = req.body;
        const target = queries.getUserById.get(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.id === req.user.id) return res.status(403).json({ error: 'Cannot suspend yourself' });

        const actorLevel = ROLE_HIERARCHY[req.user.role] || 0;
        const targetLevel = ROLE_HIERARCHY[target.role] || 0;
        if (targetLevel >= actorLevel) return res.status(403).json({ error: 'Cannot suspend a user with equal or higher rank' });

        queries.suspendUser.run(req.user.email, reason, req.params.id);
        queries.revokeAllUserSessions.run(req.user.id, target.id);

        logAudit({
            actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
            action: 'USER_SUSPENDED', targetType: 'user', targetId: target.id, targetEmail: target.email,
            details: { reason },
            ip: req.ip,
        });

        res.json({ message: 'User suspended and all sessions revoked' });
    } catch (err) {
        res.status(500).json({ error: 'Suspension failed' });
    }
});

// Restore
router.patch('/:id/restore', authenticate, requirePermission('users.restore'), (req, res) => {
    try {
        const target = queries.getUserById.get(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });

        queries.restoreUser.run(req.params.id);

        logAudit({
            actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
            action: 'USER_RESTORED', targetType: 'user', targetId: target.id, targetEmail: target.email,
            ip: req.ip,
        });

        res.json({ message: 'User restored' });
    } catch (err) {
        res.status(500).json({ error: 'Restore failed' });
    }
});

// Delete (super_admin only)
router.delete('/:id', authenticate, requirePermission('users.delete'), (req, res) => {
    try {
        const target = queries.getUserById.get(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.id === req.user.id) return res.status(403).json({ error: 'Cannot delete yourself' });
        if (target.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete a super admin' });

        queries.revokeAllUserSessions.run(req.user.id, target.id);
        queries.deleteUser.run(req.params.id);

        logAudit({
            actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
            action: 'USER_DELETED', targetType: 'user', targetId: target.id, targetEmail: target.email,
            ip: req.ip,
        });

        res.json({ message: 'User permanently deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Force password reset
router.patch('/:id/force-reset', authenticate, requirePermission('users.force_reset'), (req, res) => {
    try {
        const target = queries.getUserById.get(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });

        queries.forceResetPassword.run(req.params.id);

        logAudit({
            actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
            action: 'FORCE_PASSWORD_RESET', targetType: 'user', targetId: target.id, targetEmail: target.email,
            ip: req.ip,
        });

sendPasswordReset(
  target.email,
  target.display_name,
  'http://localhost:5173'
).catch(err => console.error('Email failed:', err.message));

        res.json({ message: 'Password reset flag set. User must change password on next login.' });
    } catch (err) {
        res.status(500).json({ error: 'Force reset failed' });
    }
});

// Update user details (admin edit)
router.patch('/:id/details', authenticate, requirePermission('users.update'), (req, res) => {
    try {
        const { displayName, department, title, notes } = req.body;
        const target = queries.getUserById.get(req.params.id);
        if (!target) return res.status(404).json({ error: 'User not found' });

        queries.updateUserDetails.run(
            displayName || target.display_name,
            department !== undefined ? department : target.department,
            title !== undefined ? title : target.title,
            notes !== undefined ? notes : target.admin_notes,
            req.params.id
        );

        logAudit({
            actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
            action: 'USER_UPDATED', targetType: 'user', targetId: target.id, targetEmail: target.email,
            details: { displayName, department, title, notes },
            ip: req.ip,
        });

        res.json({ message: 'User details updated' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

export default router;
