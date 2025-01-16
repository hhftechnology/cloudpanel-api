// src/app.js
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import config from './config/config.js';
import routes from './routes/index.js';
import { securityMiddleware } from './middleware/security.js';
import { requestLogger, errorLogger } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import databaseManager from './config/database.js';
import prometheusMetrics from './metrics/prometheus.js';
import metricCollectors from './metrics/collectors.js';

/**
 * CloudPanel API Application
 * Main application setup and initialization.
 * Configures Express server with middleware, routes, and error handling.
 */
class Application {
    constructor() {
        this.app = express();
        this.initialized = false;
    }

    /**
     * Initializes the application and all its dependencies
     * Handles startup in the correct order with proper error handling
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Initialize database first
            await databaseManager.initialize();
            console.log('Database initialized successfully');

            // Initialize metrics collection
            await prometheusMetrics.initialize();
            console.log('Prometheus metrics initialized');

            // Configure basic middleware
            this.configureMiddleware();
            console.log('Middleware configured');

            // Configure routes
            this.configureRoutes();
            console.log('Routes configured');

            // Configure error handling
            this.configureErrorHandling();
            console.log('Error handling configured');

            // Start metric collectors
            metricCollectors.startCollectors();
            console.log('Metric collectors started');

            this.initialized = true;
            console.log('Application initialization completed');
        } catch (error) {
            console.error('Application initialization failed:', error);
            throw error;
        }
    }

    /**
     * Configures Express middleware in the correct order
     * Sets up security, parsing, and utility middleware
     */
    configureMiddleware() {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors(config.security.cors));
        this.app.use(securityMiddleware);

        // Request parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Compression
        this.app.use(compression());

        // Request logging
        this.app.use(requestLogger);

        // Serve static files if configured
        if (config.server.serveStatic) {
            this.app.use('/static', express.static(path.join(config.paths.root, 'public')));
        }
    }

    /**
     * Configures application routes and API endpoints
     * Sets up metrics endpoint and API routes
     */
    configureRoutes() {
        // Health check endpoint
        this.app.get('/health', async (req, res) => {
            try {
                await databaseManager.db.get('SELECT 1');
                res.json({ status: 'healthy', timestamp: new Date().toISOString() });
            } catch (error) {
                res.status(503).json({ 
                    status: 'unhealthy',
                    error: 'Database connection failed',
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Metrics endpoint
        this.app.get('/metrics', async (req, res) => {
            try {
                const metrics = await prometheusMetrics.getMetrics();
                res.set('Content-Type', 'text/plain');
                res.send(metrics);
            } catch (error) {
                res.status(500).json({ error: 'Failed to collect metrics' });
            }
        });

        // API routes
        this.app.use('/api', routes);

        // Catch 404
        this.app.use(notFoundHandler);
    }

    /**
     * Configures error handling middleware
     * Sets up logging and error response formatting
     */
    configureErrorHandling() {
        this.app.use(errorLogger);
        this.app.use(errorHandler);

        // Handle unhandled rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            this.shutdown(1);
        });
    }

    /**
     * Starts the application server
     * @returns {Promise<void>}
     */
    async start() {
        if (!this.initialized) {
            await this.initialize();
        }

        const { port, host } = config.server;

        return new Promise((resolve) => {
            this.server = this.app.listen(port, host, () => {
                console.log(`Server running at http://${host}:${port}`);
                resolve();
            });

            // Configure server timeouts
            this.server.timeout = 30000; // 30 seconds
            this.server.keepAliveTimeout = 65000; // 65 seconds
        });
    }

    /**
     * Performs graceful shutdown of the application
     * @param {number} [code=0] - Exit code
     * @returns {Promise<void>}
     */
    async shutdown(code = 0) {
        console.log('Shutting down application...');

        try {
            // Stop metric collectors
            metricCollectors.stopCollectors();
            console.log('Metric collectors stopped');

            // Close database connections
            await databaseManager.close();
            console.log('Database connections closed');

            // Close server
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                console.log('Server stopped');
            }

            console.log('Shutdown completed');
            process.exit(code);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    /**
     * Gets Express application instance
     * Useful for testing and custom configurations
     * @returns {express.Application}
     */
    getApp() {
        return this.app;
    }
}

// Create and export application instance
const application = new Application();

// Handle shutdown signals
process.on('SIGTERM', () => application.shutdown());
process.on('SIGINT', () => application.shutdown());

export default application;

// If this is the main module, start the application
if (import.meta.url === `file://${process.argv[1]}`) {
    application.start().catch((error) => {
        console.error('Failed to start application:', error);
        process.exit(1);
    });
}