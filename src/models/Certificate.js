// src/models/Certificate.js
import { db } from '../config/database.js';
import { DatabaseError, NotFoundError } from '../middleware/errorHandler.js';
import crypto from 'crypto';

export class Certificate {
    // Certificate types enumeration for clarity and consistency
    static TYPES = {
        LETS_ENCRYPT: 1,
        CUSTOM: 2
    };

    /**
     * Find a certificate by ID with configurable data inclusion
     * For security, sensitive data (private keys) are only included when explicitly requested
     * @param {number} id - Certificate ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Certificate data
     */
    static async findById(id, options = {}) {
        try {
            // Define base fields that are always safe to return
            let fields = `
                id, site_id, uid, created_at, updated_at,
                expires_at, default_certificate, type
            `;
            
            // Include sensitive fields only when explicitly requested
            if (options.includeSensitive) {
                fields += ', private_key, certificate, certificate_chain';
            }

            const query = `
                SELECT ${fields}
                FROM certificate
                WHERE id = ?
            `;

            const certificate = await db.get(query, [id]);
            if (!certificate) {
                throw new NotFoundError('Certificate');
            }

            // Add derived status information
            const now = new Date();
            const expiryDate = new Date(certificate.expires_at);
            certificate.status = {
                isValid: expiryDate > now,
                daysUntilExpiration: Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
            };

            return certificate;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error fetching certificate');
        }
    }

    /**
     * Create a new SSL certificate
     * Handles both Let's Encrypt and custom certificates with proper validation
     * @param {Object} certData - Certificate creation data
     * @returns {Promise<Object>} Created certificate data
     */
    static async create(certData) {
        try {
            // Generate a unique identifier for the certificate
            const uid = crypto.randomBytes(16).toString('hex');

            // For Let's Encrypt certificates, we store the CSR initially
            // For custom certificates, we store the complete certificate data
            const result = await db.run(`
                INSERT INTO certificate (
                    site_id, uid, created_at, updated_at,
                    expires_at, default_certificate, type,
                    csr, private_key, certificate, certificate_chain
                ) VALUES (?, ?, datetime('now'), datetime('now'),
                         ?, ?, ?, ?, ?, ?, ?)
            `, [
                certData.site_id,
                uid,
                certData.expires_at || null,
                certData.default_certificate || 0,
                certData.type,
                certData.csr || null,
                certData.private_key || null,
                certData.certificate || null,
                certData.certificate_chain || null
            ]);

            // If this is set as the default certificate, update other certificates
            if (certData.default_certificate) {
                await this.updateDefaultStatus(certData.site_id, result.lastID);
            }

            return this.findById(result.lastID);
        } catch (error) {
            throw new DatabaseError('Error creating certificate');
        }
    }

    /**
     * Update an existing certificate
     * Commonly used to update Let's Encrypt certificates after challenge completion
     * @param {number} id - Certificate ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Update result
     */
    static async update(id, updateData) {
        try {
            const sets = [];
            const values = [];

            // Handle each updateable field
            Object.entries(updateData).forEach(([key, value]) => {
                sets.push(`${key} = ?`);
                values.push(value);
            });
            
            sets.push('updated_at = datetime("now")');
            values.push(id);

            const result = await db.run(`
                UPDATE certificate
                SET ${sets.join(', ')}
                WHERE id = ?
            `, values);

            if (result.changes === 0) {
                throw new NotFoundError('Certificate');
            }

            return result;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error updating certificate');
        }
    }

    /**
     * Update the default certificate status for a site
     * Ensures only one certificate is marked as default
     * @param {number} siteId - Site ID
     * @param {number} newDefaultCertId - New default certificate ID
     * @returns {Promise<void>}
     */
    static async updateDefaultStatus(siteId, newDefaultCertId) {
        try {
            await db.run('BEGIN TRANSACTION');

            // Remove default status from all certificates for this site
            await db.run(`
                UPDATE certificate
                SET default_certificate = 0
                WHERE site_id = ? AND id != ?
            `, [siteId, newDefaultCertId]);

            // Set the new default certificate
            await db.run(`
                UPDATE certificate
                SET default_certificate = 1
                WHERE id = ?
            `, [newDefaultCertId]);

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw new DatabaseError('Error updating default certificate status');
        }
    }

    /**
     * Find all certificates for a specific site
     * Useful for certificate management and rotation
     * @param {number} siteId - Site ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of certificates
     */
    static async findBySiteId(siteId, options = {}) {
        try {
            let fields = `
                id, uid, created_at, updated_at,
                expires_at, default_certificate, type
            `;
            
            const certificates = await db.all(`
                SELECT ${fields}
                FROM certificate
                WHERE site_id = ?
                ORDER BY created_at DESC
            `, [siteId]);

            // Add status information to each certificate
            const now = new Date();
            return certificates.map(cert => ({
                ...cert,
                status: {
                    isValid: new Date(cert.expires_at) > now,
                    daysUntilExpiration: Math.ceil(
                        (new Date(cert.expires_at) - now) / (1000 * 60 * 60 * 24)
                    )
                }
            }));
        } catch (error) {
            throw new DatabaseError('Error fetching site certificates');
        }
    }

    /**
     * Get all certificates nearing expiration
     * Useful for automated renewal notifications
     * @param {number} daysThreshold - Days threshold for expiration warning
     * @returns {Promise<Array>} List of expiring certificates
     */
    static async getExpiringCertificates(daysThreshold = 30) {
        try {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + daysThreshold);

            return await db.all(`
                SELECT c.*, s.domain_name
                FROM certificate c
                JOIN site s ON c.site_id = s.id
                WHERE c.expires_at <= datetime(?)
                AND c.expires_at > datetime('now')
                ORDER BY c.expires_at ASC
            `, [expiryDate.toISOString()]);
        } catch (error) {
            throw new DatabaseError('Error fetching expiring certificates');
        }
    }
}