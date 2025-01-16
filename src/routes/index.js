// src/routes/index.js
import { Router } from 'express';
import v1Routes from './v1/index.js';
import { requestLogger, errorLogger } from '../middleware/logging.js';
import { securityMiddleware } from '../middleware/security.js';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';
import { db } from '../config/database.js';

const router = Router();

// Apply global middleware
router.use(requestLogger);
router.use(securityMiddleware);

// API health check that verifies database connectivity
router.get('/health', async (req, res) => {
    try {
        // Check database connection
        await db.get('SELECT 1');
        
        // Get application version
        const version = await db.get(
            "SELECT value FROM config WHERE key = 'app_version'"
        );

        res.json({
            status: 'healthy',
            version: version?.value || 'unknown',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
        });
    }
});

// Documentation endpoints
router.get('/docs', (req, res) => {
    res.json({
        message: 'API documentation is available at /docs/swagger',
        version: 'v1',
        swagger_url: '/docs/swagger',
        postman_collection: '/docs/postman',
        openapi_spec: '/docs/openapi'
    });
});

// Mount API version routes
router.use('/api/v1', v1Routes);

// Catch-all route for undefined endpoints
router.use('*', notFoundHandler);

// Error handling
router.use(errorLogger);
router.use(errorHandler);

export default router;