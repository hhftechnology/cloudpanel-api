// src/routes/v1/databases.js
import { Router } from 'express';
import { databaseController } from '../../controllers/databaseController.js';
import { authenticateApiKey, requireRole, requireScope } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
import { databaseValidation } from '../../middleware/validation.js';
import { createResourceLimiter } from '../../middleware/security.js';

const router = Router();

/**
 * @route GET /api/v1/databases
 * @desc Get all databases for a site
 * @access Private
 */
router.get('/',
    authenticateApiKey,
    requireScope('databases:read'),
    databaseController.getSiteDatabases
);

/**
 * @route POST /api/v1/databases
 * @desc Create a new database with optional initial user
 * @access Private - Admin only
 */
router.post('/',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('databases:write'),
    createResourceLimiter,
    validate(databaseValidation.create),
    databaseController.createDatabase
);

/**
 * @route GET /api/v1/databases/:id/users
 * @desc Get all users for a database
 * @access Private
 */
router.get('/:id/users',
    authenticateApiKey,
    requireScope('databases:read'),
    validate([
        param('id').isInt().withMessage('Invalid database ID')
    ]),
    databaseController.getDatabaseUsers
);

/**
 * @route POST /api/v1/databases/:id/users
 * @desc Add a new user to database
 * @access Private - Admin only
 */
router.post('/:id/users',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('databases:write'),
    validate([
        param('id').isInt().withMessage('Invalid database ID'),
        ...databaseValidation.addUser
    ]),
    databaseController.addDatabaseUser
);

/**
 * @route PUT /api/v1/databases/users/:id/permissions
 * @desc Update database user permissions
 * @access Private - Admin only
 */
router.put('/users/:id/permissions',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('databases:write'),
    validate([
        param('id').isInt().withMessage('Invalid user ID'),
        body('permissions').notEmpty().withMessage('Permissions required')
    ]),
    databaseController.updateUserPermissions
);

/**
 * @route DELETE /api/v1/databases/:id
 * @desc Delete a database
 * @access Private - Admin only
 */
router.delete('/:id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('databases:write'),
    validate([
        param('id').isInt().withMessage('Invalid database ID')
    ]),
    databaseController.deleteDatabase
);

/**
 * @route POST /api/v1/databases/:id/backup
 * @desc Create database backup
 * @access Private - Admin only
 */
router.post('/:id/backup',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('databases:write'),
    validate([
        param('id').isInt().withMessage('Invalid database ID')
    ]),
    databaseController.createBackup
);

/**
 * @route POST /api/v1/databases/:id/restore
 * @desc Restore database from backup
 * @access Private - Admin only
 */
router.post('/:id/restore',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('databases:write'),
    validate([
        param('id').isInt().withMessage('Invalid database ID'),
        body('backup_file').notEmpty().withMessage('Backup file required')
    ]),
    databaseController.restoreBackup
);

export default router;