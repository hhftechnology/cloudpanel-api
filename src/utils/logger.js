// src/utils/logger.js
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { maskSensitiveData } from './helpers.js';

/**
 * Custom log formatter that ensures consistent log formatting
 * and handles sensitive data masking across the application.
 * Structures logs in a way that's easily parseable by log
 * analysis tools while remaining human-readable.
 */
const logFormatter = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    // Handle Error objects specially
    if (metadata.error instanceof Error) {
        metadata.error = {
            message: metadata.error.message,
            stack: metadata.error.stack,
            code: metadata.error.code
        };
    }

    // Mask sensitive data in logs
    const sanitizedMetadata = maskSensitiveData(metadata, [
        'password', 'token', 'apiKey', 'secret',
        'authorization', 'cookie', 'session'
    ]);

    return JSON.stringify({
        timestamp,
        level,
        message,
        ...sanitizedMetadata
    });
});

/**
 * Creates the main application logger with appropriate transports
 * and log level based on the environment.
 * @param {Object} options - Logger configuration options
 * @returns {winston.Logger} Configured logger instance
 */
function createLogger(options = {}) {
    const {
        logDir = 'logs',
        level = process.env.LOG_LEVEL || 'info',
        maxFiles = '30d',
        maxSize = '100m'
    } = options;

    // Ensure log directory exists
    const logPath = path.resolve(process.cwd(), logDir);

    // Configure base logging format
    const baseFormat = winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        logFormatter
    );

    // Create logger instance
    const logger = winston.createLogger({
        level,
        format: baseFormat,
        defaultMeta: { service: 'cloudpanel-api' },
        transports: [
            // Separate files for different log levels
            new DailyRotateFile({
                filename: path.join(logPath, 'error-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                level: 'error',
                maxFiles,
                maxSize,
                zippedArchive: true
            }),
            new DailyRotateFile({
                filename: path.join(logPath, 'combined-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxFiles,
                maxSize,
                zippedArchive: true
            })
        ],
        // Prevent process exit on uncaught exceptions
        exitOnError: false
    });

    // Add console transport in development
    if (process.env.NODE_ENV !== 'production') {
        logger.add(new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }));
    }

    return logger;
}

// Create the default logger instance
const defaultLogger = createLogger();

/**
 * Logs an API request with relevant details and timing.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in milliseconds
 */
export function logApiRequest(req, res, duration) {
    const logData = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
        userId: req.user?.id
    };

    if (res.statusCode >= 400) {
        defaultLogger.error('API Request Error', logData);
    } else {
        defaultLogger.info('API Request', logData);
    }
}

/**
 * Logs application errors with full context and stack traces.
 * @param {Error} error - Error object
 * @param {Object} context - Additional context information
 */
export function logError(error, context = {}) {
    defaultLogger.error('Application Error', {
        error,
        context,
        timestamp: new Date().toISOString()
    });
}

/**
 * Logs security-related events with appropriate context.
 * @param {string} event - Security event name
 * @param {Object} details - Event details
 */
export function logSecurityEvent(event, details) {
    defaultLogger.warn('Security Event', {
        event,
        details,
        timestamp: new Date().toISOString()
    });
}

/**
 * Logs system events like startup, shutdown, and configuration changes.
 * @param {string} event - System event name
 * @param {Object} details - Event details
 */
export function logSystemEvent(event, details) {
    defaultLogger.info('System Event', {
        event,
        details,
        timestamp: new Date().toISOString()
    });
}

/**
 * Creates a child logger with additional default metadata.
 * @param {Object} defaultMeta - Default metadata to include
 * @returns {winston.Logger} Child logger instance
 */
export function createChildLogger(defaultMeta) {
    return defaultLogger.child(defaultMeta);
}

/**
 * Logs database operations with timing and query information.
 * @param {string} operation - Database operation type
 * @param {Object} details - Operation details
 * @param {number} duration - Operation duration in milliseconds
 */
export function logDatabaseOperation(operation, details, duration) {
    // Mask sensitive data in SQL queries
    const sanitizedDetails = {
        ...details,
        query: details.query?.replace(/(['"])[^'"]*\1/g, "'***'")
    };

    defaultLogger.debug('Database Operation', {
        operation,
        duration,
        ...sanitizedDetails
    });
}

/**
 * Logs performance metrics for monitoring.
 * @param {string} metric - Metric name
 * @param {number} value - Metric value
 * @param {Object} tags - Additional metric tags
 */
export function logMetric(metric, value, tags = {}) {
    defaultLogger.info('Performance Metric', {
        metric,
        value,
        tags,
        timestamp: new Date().toISOString()
    });
}

/**
 * Logs audit events for compliance and tracking.
 * @param {string} action - Audit action
 * @param {Object} details - Action details
 * @param {Object} user - User who performed the action
 */
export function logAuditEvent(action, details, user) {
    defaultLogger.info('Audit Event', {
        action,
        details,
        user: {
            id: user.id,
            username: user.username,
            role: user.role
        },
        timestamp: new Date().toISOString()
    });
}

/**
 * High-priority logging for critical system events.
 * @param {string} message - Critical event message
 * @param {Object} context - Event context
 */
export function logCritical(message, context = {}) {
    defaultLogger.error('CRITICAL', {
        message,
        context,
        timestamp: new Date().toISOString(),
        alert: true
    });
}

// Export the default logger instance and creation function
export default defaultLogger;
export { createLogger };