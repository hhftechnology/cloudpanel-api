// src/middleware/errorHandler.js
import { ValidationError } from 'express-validator';
import { logActivity } from './logging.js';

/**
 * Custom error classes for different types of API errors
 */
export class APIError extends Error {
    constructor(message, status = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.code = code;
    }
}

export class ValidationError extends APIError {
    constructor(errors) {
        super('Validation failed', 400, 'VALIDATION_ERROR');
        this.errors = errors;
    }
}

export class NotFoundError extends APIError {
    constructor(resource) {
        super(`${resource} not found`, 404, 'NOT_FOUND');
        this.resource = resource;
    }
}

export class DatabaseError extends APIError {
    constructor(message) {
        super(message, 500, 'DATABASE_ERROR');
    }
}

/**
 * Main error handler middleware
 * Processes all errors and returns appropriate responses
 */
export const errorHandler = (err, req, res, next) => {
    // Don't log 404 errors as they're common
    if (!(err instanceof NotFoundError)) {
        req.logger.error('Error occurred:', {
            error: {
                name: err.name,
                message: err.message,
                code: err.code,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            },
            request: {
                id: req.id,
                method: req.method,
                path: req.path,
                query: req.query,
                body: req.body
            }
        });
    }

    // Log to CloudPanel's event system for significant errors
    if (err.status >= 500) {
        logActivity(req, 'API_ERROR', {
            error_type: err.name,
            error_code: err.code,
            error_message: err.message,
            path: req.path
        });
    }

    // Handle different types of errors
    if (err instanceof ValidationError) {
        return res.status(err.status).json({
            success: false,
            error: {
                code: err.code,
                message: 'Validation failed',
                details: err.errors
            }
        });
    }

    if (err instanceof NotFoundError) {
        return res.status(err.status).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                resource: err.resource
            }
        });
    }

    if (err instanceof DatabaseError) {
        return res.status(err.status).json({
            success: false,
            error: {
                code: err.code,
                message: process.env.NODE_ENV === 'production' 
                    ? 'A database error occurred' 
                    : err.message
            }
        });
    }

    // Handle unexpected errors
    const status = err.status || 500;
    const message = status === 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message;

    res.status(status).json({
        success: false,
        error: {
            code: err.code || 'INTERNAL_ERROR',
            message
        }
    });
};

/**
 * Not found handler for undefined routes
 */
export const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'The requested resource was not found'
        }
    });
};

/**
 * Async handler wrapper to catch promise rejections
 */
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Database error handler helper
 */
export const handleDatabaseError = (error) => {
    // Parse SQLite error codes
    switch (error.errno) {
        case 19: // SQLITE_CONSTRAINT
            throw new APIError(
                'Database constraint violation',
                409,
                'CONSTRAINT_ERROR'
            );
        case 1: // SQLITE_ERROR
            throw new DatabaseError(
                'A database error occurred'
            );
        default:
            throw new DatabaseError(
                'An unexpected database error occurred'
            );
    }
};

/**
 * Validation error formatter
 */
export const formatValidationErrors = (errors) => {
    return errors.map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
    }));
};

/**
 * Error handler for specific API operations
 */
export const apiErrorHandler = {
    site: {
        create: (error) => {
            if (error.code === 'SQLITE_CONSTRAINT') {
                throw new APIError(
                    'Domain name already exists',
                    409,
                    'DOMAIN_EXISTS'
                );
            }
            throw error;
        },
        update: (error) => {
            if (error.code === 'SQLITE_CONSTRAINT') {
                throw new APIError(
                    'Invalid site configuration',
                    400,
                    'INVALID_CONFIG'
                );
            }
            throw error;
        }
    },
    database: {
        create: (error) => {
            if (error.code === 'SQLITE_CONSTRAINT') {
                throw new APIError(
                    'Database name already exists',
                    409,
                    'DATABASE_EXISTS'
                );
            }
            throw error;
        }
    },
    user: {
        create: (error) => {
            if (error.code === 'SQLITE_CONSTRAINT') {
                throw new APIError(
                    'Username or email already exists',
                    409,
                    'USER_EXISTS'
                );
            }
            throw error;
        }
    }
};

export default {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    handleDatabaseError,
    formatValidationErrors,
    apiErrorHandler
};