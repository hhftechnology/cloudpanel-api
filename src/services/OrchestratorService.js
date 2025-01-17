// src/routes/v1/index.js
import { Router } from 'express';
import siteRoutes from './sites.js';
import databaseRoutes from './databases.js';
import userRoutes from './users.js';
import certificateRoutes from './certificates.js';
import monitoringRoutes from './monitoring.js';
import backupRoutes from './backup.js';
import operationsRoutes from './operations.js';

const router = Router();

// API version and status check
router.get('/', (req, res) => {
    res.json({
        success: true,
        version: 'v1',
        status: 'operational'
    });
});

// Mount route modules
router.use('/sites', siteRoutes);
router.use('/databases', databaseRoutes);
router.use('/users', userRoutes);
router.use('/certificates', certificateRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/backup', backupRoutes);
router.use('/operations', operationsRoutes);

export default router;