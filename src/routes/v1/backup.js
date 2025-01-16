// src/routes/v1/backup.js
import { Router } from 'express';
import { backupController } from '../../controllers/backupController.js';
import { authenticateApiKey, requireRole, requireScope } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
import { backupValidation } from '../../middleware/validation.js';

const router = Router();

/**
 * Site Backup Routes
 * These routes handle individual site backups including files, databases,
 * and configuration settings. Each backup is stored in the site's backup
 * directory with proper timestamps and metadata.
 */

router.post('/sites/:site_id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate(backupValidation.create),
    backupController.createSiteBackup
);

router.post('/sites/:site_id/restore/:backup_timestamp',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate(backupValidation.restore),
    backupController.restoreSiteBackup
);

router.get('/sites/:site_id',
    authenticateApiKey,
    requireScope('backups:read'),
    validate([
        param('site_id').isInt().withMessage('Invalid site ID')
    ]),
    backupController.listSiteBackups
);

/**
 * Database Backup Routes
 * Handles database-specific backups with proper locking mechanisms
 * to ensure data consistency during backup operations.
 */

router.post('/databases/:database_id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate([
        param('database_id').isInt().withMessage('Invalid database ID')
    ]),
    backupController.createDatabaseBackup
);

router.post('/databases/:database_id/restore',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate([
        param('database_id').isInt().withMessage('Invalid database ID'),
        body('backup_file').notEmpty().withMessage('Backup file required')
    ]),
    backupController.restoreDatabaseBackup
);

/**
 * System Backup Routes
 * These routes handle system-wide backups including all sites,
 * configuration files, and system settings. Requires special
 * handling for maintaining consistency across all components.
 */

router.post('/system',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate([
        body('include_sites').optional().isBoolean(),
        body('include_databases').optional().isBoolean(),
        body('include_configs').optional().isBoolean()
    ]),
    backupController.createSystemBackup
);

router.post('/system/restore',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate([
        body('backup_file').notEmpty().withMessage('Backup file required'),
        body('components').isArray().withMessage('Components selection required')
    ]),
    backupController.restoreSystemBackup
);

router.get('/system',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:read'),
    backupController.listSystemBackups
);

/**
 * Backup Management Routes
 * Handles backup retention policies, cleanup, and verification
 */

router.delete('/cleanup',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate([
        body('older_than_days').isInt().withMessage('Days threshold required'),
        body('backup_type').isIn(['site', 'database', 'system']).withMessage('Invalid backup type')
    ]),
    backupController.cleanupOldBackups
);

router.post('/verify/:backup_id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate([
        param('backup_id').isString().withMessage('Invalid backup ID')
    ]),
    backupController.verifyBackup
);

router.get('/storage',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:read'),
    backupController.getBackupStorageStats
);

/**
 * Scheduled Backup Routes
 * Manages automated backup schedules and configurations
 */

router.post('/schedule',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate([
        body('type').isIn(['site', 'database', 'system']).withMessage('Invalid backup type'),
        body('schedule').matches(/^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/).withMessage('Invalid cron schedule format'),
        body('retention_days').isInt({ min: 1 }).withMessage('Invalid retention period')
    ]),
    backupController.scheduleBackup
);

router.get('/schedule',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:read'),
    backupController.listBackupSchedules
);

router.delete('/schedule/:schedule_id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('backups:write'),
    validate([
        param('schedule_id').isInt().withMessage('Invalid schedule ID')
    ]),
    backupController.deleteBackupSchedule
);

export default router;