// src/routes/v1/users.js
import { Router } from 'express';
import { userController } from '../../controllers/userController.js';
import { authenticateApiKey, requireRole, requireScope, authRateLimiter } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
import { userValidation } from '../../middleware/validation.js';
import { sanitizeRequest } from '../../middleware/security.js';

const router = Router();

/**
 * Authentication and Profile Routes
 * These routes handle user authentication and profile management
 */

router.post('/login',
    authRateLimiter,
    validate([
        body('username').trim().notEmpty().withMessage('Username required'),
        body('password').notEmpty().withMessage('Password required'),
        body('totp').optional().isString().withMessage('Invalid TOTP code')
    ]),
    userController.login
);

router.post('/logout',
    authenticateApiKey,
    userController.logout
);

router.get('/profile',
    authenticateApiKey,
    requireScope('profile:read'),
    userController.getProfile
);

router.put('/profile',
    authenticateApiKey,
    requireScope('profile:write'),
    validate(userValidation.updateProfile),
    sanitizeRequest,
    userController.updateProfile
);

/**
 * MFA (Multi-Factor Authentication) Routes
 * Handles setup and management of two-factor authentication
 */

router.post('/mfa/enable',
    authenticateApiKey,
    requireScope('profile:write'),
    userController.enableMFA
);

router.post('/mfa/verify',
    authenticateApiKey,
    requireScope('profile:write'),
    validate([
        body('totp').isString().withMessage('TOTP code required')
    ]),
    userController.verifyMFA
);

router.post('/mfa/disable',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('profile:write'),
    validate([
        body('user_id').isInt().withMessage('Invalid user ID'),
        body('totp').isString().withMessage('TOTP code required')
    ]),
    userController.disableMFA
);

/**
 * Password Management Routes
 * Handles password changes and resets with proper security measures
 */

router.put('/password',
    authenticateApiKey,
    requireScope('profile:write'),
    validate([
        body('currentPassword').notEmpty().withMessage('Current password required'),
        body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must include uppercase, lowercase, number, and special character')
    ]),
    userController.changePassword
);

router.post('/password/reset-request',
    authRateLimiter,
    validate([
        body('email').isEmail().withMessage('Valid email required')
    ]),
    userController.requestPasswordReset
);

router.post('/password/reset',
    authRateLimiter,
    validate([
        body('token').notEmpty().withMessage('Reset token required'),
        body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must include uppercase, lowercase, number, and special character')
    ]),
    userController.resetPassword
);

/**
 * User Management Routes (Admin only)
 * These routes are restricted to administrators for user management
 */

router.get('/',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('users:read'),
    userController.getAllUsers
);

router.post('/',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('users:write'),
    validate(userValidation.create),
    sanitizeRequest,
    userController.createUser
);

router.get('/:id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('users:read'),
    validate([
        param('id').isInt().withMessage('Invalid user ID')
    ]),
    userController.getUser
);

router.put('/:id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('users:write'),
    validate([
        param('id').isInt().withMessage('Invalid user ID'),
        ...userValidation.update
    ]),
    sanitizeRequest,
    userController.updateUser
);

router.delete('/:id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('users:write'),
    validate([
        param('id').isInt().withMessage('Invalid user ID')
    ]),
    userController.deleteUser
);

/**
 * User Preferences Routes
 * Handles user-specific settings and preferences
 */

router.get('/preferences',
    authenticateApiKey,
    requireScope('profile:read'),
    userController.getPreferences
);

router.put('/preferences',
    authenticateApiKey,
    requireScope('profile:write'),
    validate([
        body('timezone_id').optional().isInt(),
        body('notifications').optional().isObject()
    ]),
    userController.updatePreferences
);

/**
 * API Key Management Routes
 * Allows users to manage their API keys
 */

router.get('/api-keys',
    authenticateApiKey,
    requireScope('profile:read'),
    userController.getApiKeys
);

router.post('/api-keys',
    authenticateApiKey,
    requireScope('profile:write'),
    validate([
        body('name').notEmpty().withMessage('API key name required'),
        body('scopes').isArray().withMessage('Scopes must be an array')
    ]),
    userController.createApiKey
);

router.delete('/api-keys/:keyId',
    authenticateApiKey,
    requireScope('profile:write'),
    validate([
        param('keyId').isString().withMessage('Invalid API key ID')
    ]),
    userController.revokeApiKey
);

export default router;