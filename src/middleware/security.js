// src/middleware/security.js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { createHash } from 'crypto';

/**
 * Security middleware collection for CloudPanel API
 * Implements various security measures and protections
 */

// Basic rate limiting configuration
const createRateLimiter = (options = {}) => {
    return rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: {
            success: false,
            error: 'Too many requests, please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
        ...options
    });
};

// CORS configuration
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests from CloudPanel UI origin
        const allowedOrigins = process.env.ALLOWED_ORIGINS 
            ? process.env.ALLOWED_ORIGINS.split(',') 
            : [];
            
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400 // 24 hours
};

// Collection of security middleware
export const securityMiddleware = [
    // Helmet security headers
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: "same-site" },
        dnsPrefetchControl: { allow: false },
        expectCt: {
            maxAge: 86400,
            enforce: true
        },
        frameguard: { action: "deny" },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        },
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: { permittedPolicies: "none" },
        referrerPolicy: { policy: "same-origin" },
        xssFilter: true
    }),

    // CORS handling
    cors(corsOptions),

    // Rate limiting
    createRateLimiter(),

    // Request size limits
    express.json({ limit: '10mb' }),
    express.urlencoded({ extended: true, limit: '10mb' }),

    // Custom security checks
    (req, res, next) => {
        // Block requests with suspicious SQL patterns
        const suspiciousPatterns = [
            /union\s+select/i,
            /\/\*.*\*\//,
            /;\s*drop\s+table/i,
            /;\s*delete\s+from/i,
            /'\s*or\s+'1'\s*=\s*'1/i
        ];

        const requestBody = JSON.stringify(req.body).toLowerCase();
        const requestQuery = JSON.stringify(req.query).toLowerCase();

        if (suspiciousPatterns.some(pattern => 
            pattern.test(requestBody) || pattern.test(requestQuery)
        )) {
            return res.status(403).json({
                success: false,
                error: 'Potentially malicious request detected'
            });
        }

        next();
    },

    // Request validation
    (req, res, next) => {
        // Generate request ID for tracking
        req.id = createHash('sha256')
            .update(Date.now() + Math.random().toString())
            .digest('hex')
            .substring(0, 32);

        // Add security headers
        res.setHeader('X-Request-ID', req.id);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');

        next();
    }
];

// Additional rate limiters for specific endpoints
export const authRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 attempts per hour
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.'
    }
});

export const createResourceLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // 30 resource creations per hour
    message: {
        success: false,
        error: 'Resource creation rate limit exceeded.'
    }
});

// IP filtering middleware
export const ipFilter = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Check if IP is in CloudPanel's allowed list
    db.get(
        'SELECT COUNT(*) as count FROM firewall_rule WHERE ? LIKE source',
        [clientIP]
    ).then(result => {
        if (result.count > 0) {
            next();
        } else {
            res.status(403).json({
                success: false,
                error: 'Access denied from your IP address'
            });
        }
    }).catch(next);
};

// Request sanitization
export const sanitizeRequest = (req, res, next) => {
    const sanitize = (obj) => {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        return Object.keys(obj).reduce((acc, key) => {
            // Remove any keys containing harmful patterns
            if (typeof key === 'string' && 
                !key.match(/[<>'"]/)) {
                
                let value = obj[key];
                
                // Recursively sanitize objects
                if (typeof value === 'object' && value !== null) {
                    value = sanitize(value);
                }
                
                // Sanitize string values
                if (typeof value === 'string') {
                    value = value
                        .replace(/[<>]/g, '') // Remove < and >
                        .replace(/javascript:/gi, '') // Remove javascript: protocol
                        .replace(/data:/gi, '') // Remove data: protocol
                        .trim();
                }
                
                acc[key] = value;
            }
            return acc;
        }, {});
    };

    req.body = sanitize(req.body);
    req.query = sanitize(req.query);
    req.params = sanitize(req.params);

    next();
};

// Export composite security middleware
export default {
    securityMiddleware,
    authRateLimiter,
    createResourceLimiter,
    ipFilter,
    sanitizeRequest
};