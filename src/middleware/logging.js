// src/middleware/logging.js
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { UAParser } from 'ua-parser-js';
import { db } from '../config/database.js';

/**
 * Logging middleware for CloudPanel API
 * Handles both system logging and API access logging
 * Integrates with CloudPanel's event logging system
 */

// Configure winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'cloudpanel-api' },
    transports: [
        // Error logs
        new DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '30d',
            maxSize: '20m'
        }),
        
        // Combined logs
        new DailyRotateFile({
            filename: 'logs/combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '30d',
            maxSize: '20m'
        }),

        // Real-time console output for development
        ...(process.env.NODE_ENV !== 'production' ? [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            })
        ] : [])
    ]
});

// Parse user agent string
const parseUserAgent = (userAgent) => {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    return {
        browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`,
        os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`,
        device: result.device.type || 'desktop'
    };
};

// Log to CloudPanel's event table
const logToDatabase = async (eventData) => {
    try {
        await db.run(`
            INSERT INTO event (
                created_at,
                user_name,
                user_role,
                event_name,
                event_data,
                source_ip_address,
                user_agent
            ) VALUES (
                datetime('now'),
                ?, ?, ?, ?, ?, ?
            )
        `, [
            eventData.user_name || 'system',
            eventData.user_role || 'system',
            eventData.event_name,
            JSON.stringify(eventData.event_data),
            eventData.source_ip_address,
            eventData.user_agent
        ]);
    } catch (error) {
        logger.error('Failed to write to event log:', error);
    }
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    
    // Add logging utility to request object
    req.logger = logger;

    // Log request start
    const logData = {
        request_id: req.id,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        api_key: req.apiKey?.id // Only log API key ID, never the actual key
    };

    logger.info('API Request', logData);

    // Log response after it's sent
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const userAgentInfo = parseUserAgent(req.headers['user-agent']);

        // Enhanced log data
        const responseLogData = {
            ...logData,
            status_code: res.statusCode,
            duration_ms: duration,
            user_agent_details: userAgentInfo,
            response_time: duration,
            bytes_sent: res.getHeader('Content-Length')
        };

        // Log to winston
        logger.info('API Response', responseLogData);

        // Log to CloudPanel's event table for significant events
        if (res.statusCode >= 400 || duration > 1000) {
            logToDatabase({
                user_name: req.apiKey?.name,
                user_role: req.apiKey?.role,
                event_name: `API_${res.statusCode >= 400 ? 'ERROR' : 'SLOW_REQUEST'}`,
                event_data: responseLogData,
                source_ip_address: req.ip,
                user_agent: req.headers['user-agent']
            });
        }
    });

    next();
};

// Error logging middleware
export const errorLogger = (err, req, res, next) => {
    const errorData = {
        request_id: req.id,
        error: {
            message: err.message,
            stack: err.stack,
            type: err.name,
            code: err.code
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            headers: req.headers,
            query: req.query,
            body: req.body
        },
        user: {
            api_key_id: req.apiKey?.id,
            role: req.apiKey?.role
        }
    };

    // Log error details
    logger.error('API Error', errorData);

    // Log to CloudPanel's event table
    logToDatabase({
        user_name: req.apiKey?.name,
        user_role: req.apiKey?.role,
        event_name: 'API_ERROR',
        event_data: {
            error_message: err.message,
            request_url: req.originalUrl,
            method: req.method
        },
        source_ip_address: req.ip,
        user_agent: req.headers['user-agent']
    });

    next(err);
};

// Activity logging helper
export const logActivity = async (req, eventName, eventData) => {
    const activityData = {
        user_name: req.apiKey?.name,
        user_role: req.apiKey?.role,
        event_name: eventName,
        event_data: eventData,
        source_ip_address: req.ip,
        user_agent: req.headers['user-agent']
    };

    // Log to winston
    logger.info('Activity Log', activityData);

    // Log to database
    await logToDatabase(activityData);
};

// Export all logging utilities
export default {
    logger,
    requestLogger,
    errorLogger,
    logActivity
};