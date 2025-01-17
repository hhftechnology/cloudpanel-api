// src/routes/v1/operations.js

import { Router } from 'express';
import { authenticateApiKey, requireScope } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
import { getOperationStatus, listOperations } from '../../middleware/ControllerAdapter.js';

const router = Router();

/**
 * @route GET /api/v1/operations/:operationId
 * @desc Get status of a specific operation
 * @access Private
 */
router.get('/:operationId',
    authenticateApiKey,
    requireScope('operations:read'),
    validate([
        param('operationId').isInt().withMessage('Invalid operation ID')
    ]),
    getOperationStatus
);

/**
 * @route GET /api/v1/operations
 * @desc List operations with optional status filter
 * @access Private
 */
router.get('/',
    authenticateApiKey,
    requireScope('operations:read'),
    validate([
        query('status')
            .optional()
            .isIn(['pending', 'processing', 'completed', 'failed'])
            .withMessage('Invalid status'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ]),
    listOperations
);

export default router;