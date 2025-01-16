// src/controllers/certificateController.js
import { Certificate } from '../models/Certificate.js';
import { Site } from '../models/Site.js';
import { validateCertificate } from '../utils/validation.js';
import crypto from 'crypto';

/**
 * Controller for managing SSL certificates in CloudPanel
 * Handles both Let's Encrypt and custom SSL certificates
 */
export const certificateController = {
  /**
   * Retrieve all certificates for a specific site
   * Excludes sensitive data like private keys
   */
  async getSiteCertificates(req, res) {
    try {
      const siteId = req.params.siteId;
      
      // First verify the site exists
      const site = await Site.findById(siteId);
      if (!site) {
        return res.status(404).json({
          success: false,
          error: 'Site not found'
        });
      }

      const certificates = await Certificate.findAll(siteId);
      
      // Remove sensitive information
      const sanitizedCerts = certificates.map(cert => ({
        id: cert.id,
        site_id: cert.site_id,
        expires_at: cert.expires_at,
        type: cert.type,
        default_certificate: cert.default_certificate,
        created_at: cert.created_at
      }));

      res.json({
        success: true,
        data: sanitizedCerts
      });
    } catch (error) {
      req.logger.error('Error fetching certificates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch certificates'
      });
    }
  },

  /**
   * Upload and install a custom SSL certificate
   * Validates certificate format and chain
   */
  async uploadCustomCertificate(req, res) {
    try {
      const { site_id, certificate, private_key, certificate_chain } = req.body;

      // Verify site exists
      const site = await Site.findById(site_id);
      if (!site) {
        return res.status(404).json({
          success: false,
          error: 'Site not found'
        });
      }

      // Validate certificate format and chain
      const validationResult = validateCertificate({
        certificate,
        private_key,
        certificate_chain
      });

      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          error: validationResult.error
        });
      }

      // Generate unique identifier for the certificate
      const uid = crypto.randomBytes(16).toString('hex');

      // Calculate expiration date from certificate
      const expires_at = validationResult.expires_at;

      const result = await Certificate.create({
        site_id,
        uid,
        expires_at,
        type: 2, // Custom certificate type
        certificate,
        private_key,
        certificate_chain,
        default_certificate: 1 // Make this the default certificate
      });

      // Update any existing default certificates for this site
      await Certificate.updateDefaultStatus(site_id, result.lastID);

      res.status(201).json({
        success: true,
        data: {
          id: result.lastID,
          site_id,
          expires_at,
          type: 2,
          default_certificate: 1
        }
      });
    } catch (error) {
      req.logger.error('Error uploading certificate:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload certificate'
      });
    }
  },

  /**
   * Request a new Let's Encrypt certificate
   * Handles domain validation and certificate issuance
   */
  async requestLetsEncrypt(req, res) {
    try {
      const { site_id } = req.body;

      // Verify site exists and get domain information
      const site = await Site.findById(site_id);
      if (!site) {
        return res.status(404).json({
          success: false,
          error: 'Site not found'
        });
      }

      // Generate CSR for the domain
      const csr = await generateCSR(site.domain_name);

      // Create initial certificate record
      const uid = crypto.randomBytes(16).toString('hex');
      const pendingCert = await Certificate.create({
        site_id,
        uid,
        type: 1, // Let's Encrypt type
        csr,
        default_certificate: 0 // Not default until successful
      });

      // Initiate Let's Encrypt challenge (non-blocking)
      handleLetsEncryptChallenge(pendingCert.lastID, site)
        .then(async (success) => {
          if (success) {
            // Update certificate status and make it default
            await Certificate.updateDefaultStatus(site_id, pendingCert.lastID);
          }
        })
        .catch(error => {
          req.logger.error('Let\'s Encrypt challenge failed:', error);
        });

      res.status(202).json({
        success: true,
        message: 'Let\'s Encrypt certificate request initiated',
        data: {
          id: pendingCert.lastID,
          site_id,
          type: 1
        }
      });
    } catch (error) {
      req.logger.error('Error requesting Let\'s Encrypt certificate:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to request Let\'s Encrypt certificate'
      });
    }
  },

  /**
   * Check the status of a certificate
   * Includes expiration and validation details
   */
  async getCertificateStatus(req, res) {
    try {
      const certId = req.params.id;
      
      const certificate = await Certificate.findById(certId);
      if (!certificate) {
        return res.status(404).json({
          success: false,
          error: 'Certificate not found'
        });
      }

      // Calculate days until expiration
      const expiresAt = new Date(certificate.expires_at);
      const now = new Date();
      const daysUntilExpiration = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

      res.json({
        success: true,
        data: {
          id: certificate.id,
          site_id: certificate.site_id,
          type: certificate.type,
          status: daysUntilExpiration > 0 ? 'valid' : 'expired',
          days_until_expiration: daysUntilExpiration,
          expires_at: certificate.expires_at,
          is_default: certificate.default_certificate === 1
        }
      });
    } catch (error) {
      req.logger.error('Error checking certificate status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check certificate status'
      });
    }
  }
};

/**
 * Generate a Certificate Signing Request (CSR)
 * Used for Let's Encrypt certificate requests
 */
async function generateCSR(domain) {
  // Implementation of CSR generation
  // This would typically use OpenSSL or similar
  return ''; // Placeholder
}

/**
 * Handle the Let's Encrypt domain validation challenge
 * This is an asynchronous process that may take some time
 */
async function handleLetsEncryptChallenge(certId, site) {
  // Implementation of Let's Encrypt challenge handling
  // This would integrate with Let's Encrypt's ACME protocol
  return true; // Placeholder
}