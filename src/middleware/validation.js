// src/middleware/validation.js
import { body, param, query, validationResult } from 'express-validator';

/**
 * Common validation middleware for CloudPanel API
 * Provides reusable validation chains for different entity types
 */

// Helper function to validate domain names
export const isDomainName = (value) => {
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(value);
};

// Helper function to validate database names
export const isDatabaseName = (value) => {
    const dbNameRegex = /^[a-zA-Z0-9_]+$/;
    return dbNameRegex.test(value);
};

// Validate results and format error messages
export const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        res.status(400).json({
            success: false,
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg
            }))
        });
    };
};

// Site validation rules
export const siteValidation = {
    create: [
        body('domain_name')
            .trim()
            .notEmpty()
            .withMessage('Domain name is required')
            .custom(isDomainName)
            .withMessage('Invalid domain name format'),
        
        body('type')
            .isIn(['php', 'python', 'node', 'static'])
            .withMessage('Invalid site type'),

        body('php_version')
            .optional()
            .isFloat({ min: 7.0, max: 8.4 })
            .withMessage('Invalid PHP version'),

        body('varnish_cache')
            .optional()
            .isBoolean()
            .withMessage('Varnish cache must be boolean'),

        body('page_speed_enabled')
            .optional()
            .isBoolean()
            .withMessage('Page speed enabled must be boolean')
    ],

    update: [
        param('id')
            .isInt()
            .withMessage('Invalid site ID'),

        body('php_settings.memory_limit')
            .optional()
            .matches(/^\d+[KMG]$/)
            .withMessage('Invalid memory limit format (e.g., 256M)'),

        body('php_settings.max_execution_time')
            .optional()
            .isInt({ min: 0, max: 3600 })
            .withMessage('Max execution time must be between 0 and 3600'),

        body('php_settings.post_max_size')
            .optional()
            .matches(/^\d+[KMG]$/)
            .withMessage('Invalid post max size format (e.g., 64M)')
    ]
};

// Database validation rules
export const databaseValidation = {
    create: [
        body('name')
            .trim()
            .notEmpty()
            .withMessage('Database name is required')
            .custom(isDatabaseName)
            .withMessage('Invalid database name format'),

        body('site_id')
            .isInt()
            .withMessage('Invalid site ID'),

        body('user.username')
            .optional()
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Invalid username format'),

        body('user.password')
            .optional()
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters')
    ],

    addUser: [
        body('username')
            .trim()
            .notEmpty()
            .withMessage('Username is required')
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Invalid username format'),

        body('password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .withMessage('Password must contain uppercase, lowercase, and numbers'),

        body('permissions')
            .optional()
            .isString()
            .withMessage('Invalid permissions format')
    ]
};

// User validation rules
export const userValidation = {
    create: [
        body('user_name')
            .trim()
            .notEmpty()
            .withMessage('Username is required')
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Invalid username format'),

        body('email')
            .trim()
            .notEmpty()
            .withMessage('Email is required')
            .isEmail()
            .withMessage('Invalid email format'),

        body('password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must contain uppercase, lowercase, numbers, and special characters'),

        body('role')
            .isIn(['admin', 'user'])
            .withMessage('Invalid role'),

        body('timezone_id')
            .optional()
            .isInt()
            .withMessage('Invalid timezone ID')
    ],

    update: [
        param('id')
            .isInt()
            .withMessage('Invalid user ID'),

        body('email')
            .optional()
            .trim()
            .isEmail()
            .withMessage('Invalid email format'),

        body('status')
            .optional()
            .isIn([0, 1])
            .withMessage('Invalid status value')
    ]
};

// Certificate validation rules
export const certificateValidation = {
    upload: [
        body('site_id')
            .isInt()
            .withMessage('Invalid site ID'),

        body('certificate')
            .notEmpty()
            .withMessage('Certificate is required')
            .custom(value => {
                return value.includes('BEGIN CERTIFICATE') && 
                       value.includes('END CERTIFICATE');
            })
            .withMessage('Invalid certificate format'),

        body('private_key')
            .notEmpty()
            .withMessage('Private key is required')
            .custom(value => {
                return value.includes('BEGIN PRIVATE KEY') && 
                       value.includes('END PRIVATE KEY');
            })
            .withMessage('Invalid private key format'),

        body('certificate_chain')
            .optional()
            .custom(value => {
                return !value || (
                    value.includes('BEGIN CERTIFICATE') && 
                    value.includes('END CERTIFICATE')
                );
            })
            .withMessage('Invalid certificate chain format')
    ]
};

// Monitoring validation rules
export const monitoringValidation = {
    metrics: [
        query('startTime')
            .optional()
            .isISO8601()
            .withMessage('Invalid start time format'),

        query('endTime')
            .optional()
            .isISO8601()
            .withMessage('Invalid end time format'),

        query('interval')
            .optional()
            .isIn(['5min', '1hour', '1day'])
            .withMessage('Invalid interval')
    ]
};

// Backup validation rules
export const backupValidation = {
    create: [
        param('site_id')
            .isInt()
            .withMessage('Invalid site ID')
    ],

    restore: [
        param('site_id')
            .isInt()
            .withMessage('Invalid site ID'),

        param('backup_timestamp')
            .matches(/^\d{8}_\d{6}$/)
            .withMessage('Invalid backup timestamp format')
    ]
};