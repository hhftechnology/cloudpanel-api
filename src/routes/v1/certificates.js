// src/routes/v1/certificates.js
import { Router } from 'express';
import { certificateController } from '../../controllers/certificateController.js';
import { authenticateApiKey, requireRole, requireScope } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
import { certificateValidation } from '../../middleware/validation.js';
import { createResourceLimiter } from '../../middleware/security.js';

const router = Router();

/**
 * @route GET /api/v1/certificates/site/:siteId
 * @desc Get all certificates for a site
 * @access Private
 */
router.get('/site/:siteId',
    authenticateApiKey,
    requireScope('certificates:read'),
    validate([
        param('siteId').isInt().withMessage('Invalid site ID')
    ]),
    certificateController.getSiteCertificates
);

/**
 * @route POST /api/v1/certificates/custom
 * @desc Upload and install custom SSL certificate
 * @access Private - Admin only
 */
router.post('/custom',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('certificates:write'),
    createResourceLimiter,
    validate(certificateValidation.upload),
    certificateController.uploadCustomCertificate
);

/**
 * @route POST /api/v1/certificates/letsencrypt
 * @desc Request new Let's Encrypt certificate
 * @access Private - Admin only
 */
router.post('/letsencrypt',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('certificates:write'),
    createResourceLimiter,
    validate([
        body('site_id').isInt().withMessage('Invalid site ID')
    ]),
    certificateController.requestLetsEncrypt
);

/**
 * @route GET /api/v1/certificates/:id/status
 * @desc Check certificate status and expiration
 * @access Private
 */
router.get('/:id/status',
    authenticateApiKey,
    requireScope('certificates:read'),
    validate([
        param('id').isInt().withMessage('Invalid certificate ID')
    ]),
    certificateController.getCertificateStatus
);

/**
 * @route DELETE /api/v1/certificates/:id
 * @desc Delete a certificate
 * @access Private - Admin only
 */
router.delete('/:id',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('certificates:write'),
    validate([
        param('id').isInt().withMessage('Invalid certificate ID')
    ]),
    certificateController.deleteCertificate
);

/**
 * @route POST /api/v1/certificates/:id/renew
 * @desc Renew an existing certificate
 * @access Private - Admin only
 */
router.post('/:id/renew',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('certificates:write'),
    validate([
        param('id').isInt().withMessage('Invalid certificate ID')
    ]),
    certificateController.renewCertificate
);

/**
 * @route PUT /api/v1/certificates/:id/make-default
 * @desc Set certificate as default for site
 * @access Private - Admin only
 */
router.put('/:id/make-default',
    authenticateApiKey,
    requireRole('admin'),
    requireScope('certificates:write'),
    validate([
        param('id').isInt().withMessage('Invalid certificate ID')
    ]),
    certificateController.setDefaultCertificate
);

export default router;