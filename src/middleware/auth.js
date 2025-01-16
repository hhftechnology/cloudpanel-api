// src/middleware/auth.js
import { db } from '../config/database.js';
import crypto from 'crypto';

/**
 * Authentication middleware for CloudPanel API
 * Handles API key validation and role-based access control
 */

// Time-safe string comparison to prevent timing attacks
const safeCompare = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    return crypto.timingSafeEqual(
        Buffer.from(a, 'utf8'),
        Buffer.from(b.padEnd(a.length))
    );
};

// Generate API key hash for storage
export const generateApiKeyHash = (apiKey) => {
    return crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');
};

// Verify API key exists and is active
export const authenticateApiKey = async (req, res, next) => {
    try {
        const apiKey = req.header('X-API-Key');
        
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API key required'
            });
        }

        const keyHash = generateApiKeyHash(apiKey);
        const apiKeyRecord = await db.get(`
            SELECT ak.*, u.role as user_role
            FROM api_token ak
            JOIN user u ON ak.user_id = u.id
            WHERE ak.token = ? AND ak.is_active = 1
        `, [keyHash]);

        if (!apiKeyRecord) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key'
            });
        }

        // Add API key info to request for use in controllers
        req.apiKey = {
            id: apiKeyRecord.id,
            name: apiKeyRecord.name,
            role: apiKeyRecord.user_role,
            created_at: apiKeyRecord.created_at
        };

        next();
    } catch (error) {
        next(error);
    }
};

// Role-based access control middleware
export const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.apiKey || !req.apiKey.role) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const hasPermission = Array.isArray(allowedRoles)
            ? allowedRoles.includes(req.apiKey.role)
            : allowedRoles === req.apiKey.role;

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }

        next();
    };
};

// Rate limiting by API key
const rateLimits = new Map();
export const rateLimiter = (limit = 100, windowMs = 15 * 60 * 1000) => {
    return (req, res, next) => {
        if (!req.apiKey) {
            return next();
        }

        const key = req.apiKey.id;
        const now = Date.now();
        
        if (!rateLimits.has(key)) {
            rateLimits.set(key, {
                count: 1,
                resetTime: now + windowMs
            });
            return next();
        }

        const limitData = rateLimits.get(key);

        if (now > limitData.resetTime) {
            limitData.count = 1;
            limitData.resetTime = now + windowMs;
            return next();
        }

        if (limitData.count >= limit) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded',
                resetTime: new Date(limitData.resetTime)
            });
        }

        limitData.count++;
        next();
    };
};

// API key scope validation
export const requireScope = (requiredScope) => {
    return async (req, res, next) => {
        try {
            if (!req.apiKey) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            const keyScopes = await db.get(`
                SELECT scopes 
                FROM api_token 
                WHERE id = ?
            `, [req.apiKey.id]);

            if (!keyScopes || !keyScopes.scopes) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid API key scope'
                });
            }

            const scopes = keyScopes.scopes.split(',');
            if (!scopes.includes(requiredScope) && !scopes.includes('*')) {
                return res.status(403).json({
                    success: false,
                    error: `Required scope: ${requiredScope}`
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};