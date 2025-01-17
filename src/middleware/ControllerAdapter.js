// src/middleware/ControllerAdapter.js

import OrchestratorService from '../services/OrchestratorService.js';

export const wrapWithOrchestration = (controllerMethod, operationType) => {
    return async (req, res, next) => {
        const operationData = {
            ...req.body,
            params: req.params,
            query: req.query,
            user: req.user?.id
        };

        try {
            // Create operation record
            const operationId = await OrchestratorService.triggerOperation(
                operationType,
                operationData
            );

            // Return operation details to client
            res.json({
                success: true,
                operation: {
                    id: operationId,
                    type: operationType,
                    status: OrchestratorService.OPERATION_STATUSES.PENDING
                },
                message: 'Operation queued successfully'
            });

            // Execute controller method asynchronously
            controllerMethod(req, res, next).catch(error => {
                OrchestratorService.updateOperationStatus(
                    operationId,
                    OrchestratorService.OPERATION_STATUSES.FAILED,
                    error.message
                );
            });
        } catch (error) {
            next(error);
        }
    };
};

export const getOperationStatus = async (req, res, next) => {
    try {
        const { operationId } = req.params;
        const status = await OrchestratorService.getOperationStatus(operationId);
        
        if (!status) {
            return res.status(404).json({
                success: false,
                error: 'Operation not found'
            });
        }

        res.json({
            success: true,
            operation: status
        });
    } catch (error) {
        next(error);
    }
};

export const listOperations = async (req, res, next) => {
    try {
        const { status = 'pending', limit = 10 } = req.query;
        const operations = await OrchestratorService.getOperationsByStatus(status, limit);

        res.json({
            success: true,
            operations
        });
    } catch (error) {
        next(error);
    }
};