// src/config/config.js
import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Base configuration with secure defaults
const defaultConfig = {
    // Existing server settings
    server: {
        port: 3000,
        host: 'localhost',
        env: process.env.NODE_ENV || 'development',
        timezone: 'UTC',
    },

    // Existing security settings
    security: {
        apiKeyLength: 32,
        rateLimits: {
            windowMs: 15 * 60 * 1000,
            max: 100,
        },
        cors: {
            allowedOrigins: process.env.ALLOWED_ORIGINS 
                ? process.env.ALLOWED_ORIGINS.split(',') 
                : ['http://localhost:3000'],
            allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        },
    },

    // Updated paths configuration to use environment variables
    paths: {
        root: process.cwd(),
        // Database path from environment or default
        data: process.env.DB_PATH || path.join(process.cwd(), 'data'),
        logs: process.env.LOG_PATH || path.join(process.cwd(), 'logs'),
        temp: process.env.TEMP_PATH || path.join(process.cwd(), 'temp'),
        backups: process.env.BACKUP_PATH || path.join(process.cwd(), 'backups'),
    },

    // Existing logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        maxFiles: '30d',
        maxSize: '100m',
        maskFields: ['password', 'token', 'apiKey', 'secret'],
    },

    // Existing email settings
    email: {
        enabled: process.env.SMTP_ENABLED === 'true',
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        from: process.env.SMTP_FROM || 'CloudPanel <noreply@localhost>',
    },

    // Existing monitoring settings
    monitoring: {
        enabled: true,
        metrics: {
            collectInterval: 60000,
            retentionDays: 30,
        },
        alerts: {
            thresholds: {
                cpu: { warning: 80, critical: 90 },
                memory: { warning: 85, critical: 95 },
                disk: { warning: 85, critical: 90 },
            },
        },
    },

    // New database-specific configuration
    database: {
        filename: process.env.DB_FILENAME || 'cloudpanel.db',
        // Construct full database path
        get path() {
            return path.join(defaultConfig.paths.data, this.filename);
        },
        // Database backup location
        get backupPath() {
            return path.join(defaultConfig.paths.backups, 'db');
        },
        options: {
            WAL: true,
            busyTimeout: 5000,
            cache: -2000, // 2MB cache
            foreign_keys: true
        }
    }
};

// Environment-specific overrides (keeping existing structure)
const envConfigs = {
    development: {
        logging: {
            level: 'debug',
        },
        security: {
            rateLimits: {
                max: 1000,
            },
        },
    },
    production: {
        security: {
            cors: {
                allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
            },
        },
        logging: {
            level: 'info',
        },
    },
    test: {
        server: {
            port: 3001,
        },
        logging: {
            level: 'error',
        },
        // In-memory database for testing
        database: {
            filename: ':memory:'
        }
    },
};

// Keeping existing mergeConfigs function
function mergeConfigs(base, override) {
    const merged = { ...base };
    
    for (const key in override) {
        if (typeof override[key] === 'object' && !Array.isArray(override[key])) {
            merged[key] = mergeConfigs(base[key] || {}, override[key]);
        } else {
            merged[key] = override[key];
        }
    }
    
    return merged;
}

// Keeping existing validation function with added database checks
function validateConfig(config) {
    // Existing validations
    if (typeof config.server.port !== 'number' || config.server.port < 1 || config.server.port > 65535) {
        throw new Error('Invalid server port configuration');
    }

    // Validate file paths
    for (const [key, value] of Object.entries(config.paths)) {
        if (typeof value !== 'string' || !path.isAbsolute(value)) {
            throw new Error(`Invalid ${key} path configuration`);
        }
    }

    // Add database path validation
    if (config.database.filename !== ':memory:') {
        const dbDir = path.dirname(config.database.path);
        try {
            // Ensure directory exists
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true, mode: 0o750 });
            }
        } catch (error) {
            throw new Error(`Failed to create database directory: ${error.message}`);
        }
    }
}

// Build final configuration (keeping existing structure)
const currentEnv = process.env.NODE_ENV || 'development';
const envConfig = envConfigs[currentEnv] || {};
const config = mergeConfigs(defaultConfig, envConfig);

// Validate the configuration
validateConfig(config);

// Freeze the configuration to prevent modifications
const finalConfig = Object.freeze(config);

export default finalConfig;