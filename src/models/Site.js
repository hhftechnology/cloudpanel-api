// src/models/Site.js
import { db } from '../config/database.js';
import { DatabaseError, NotFoundError } from '../middleware/errorHandler.js';

export class Site {
    /**
     * Find a site by its ID with optional related data
     * @param {number} id - Site ID
     * @param {Object} options - Query options (e.g., include PHP settings)
     * @returns {Promise<Object>} Site data
     */
    static async findById(id, options = {}) {
        try {
            let query = 'SELECT s.* FROM site s WHERE s.id = ?';
            
            if (options.includePhpSettings) {
                query = `
                    SELECT s.*, ps.*
                    FROM site s
                    LEFT JOIN php_settings ps ON s.php_settings_id = ps.id
                    WHERE s.id = ?
                `;
            }

            const site = await db.get(query, [id]);
            if (!site) {
                throw new NotFoundError('Site');
            }

            return site;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error fetching site');
        }
    }

    /**
     * Find a site by domain name
     * @param {string} domainName - Domain name to search for
     * @returns {Promise<Object>} Site data
     */
    static async findByDomain(domainName) {
        try {
            return await db.get(
                'SELECT * FROM site WHERE domain_name = ?',
                [domainName]
            );
        } catch (error) {
            throw new DatabaseError('Error fetching site by domain');
        }
    }

    /**
     * Create a new site with required configurations
     * @param {Object} siteData - Site creation data
     * @returns {Promise<Object>} Created site data
     */
    static async create(siteData) {
        try {
            return await db.run(`
                INSERT INTO site (
                    domain_name, type, root_directory, user,
                    php_settings_id, vhost_template, application,
                    page_speed_enabled, varnish_cache,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                siteData.domain_name,
                siteData.type,
                siteData.root_directory,
                siteData.user,
                siteData.php_settings_id,
                siteData.vhost_template,
                siteData.application,
                siteData.page_speed_enabled ? 1 : 0,
                siteData.varnish_cache ? 1 : 0
            ]);
        } catch (error) {
            throw new DatabaseError('Error creating site');
        }
    }

    /**
     * Update site configuration
     * @param {number} id - Site ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Update result
     */
    static async update(id, updateData) {
        try {
            const sets = [];
            const values = [];

            // Build dynamic SET clause
            Object.entries(updateData).forEach(([key, value]) => {
                sets.push(`${key} = ?`);
                values.push(value);
            });
            
            values.push(id); // Add ID for WHERE clause

            const result = await db.run(`
                UPDATE site
                SET ${sets.join(', ')}, updated_at = datetime('now')
                WHERE id = ?
            `, values);

            if (result.changes === 0) {
                throw new NotFoundError('Site');
            }

            return result;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error updating site');
        }
    }

    /**
     * Delete a site and its related data
     * @param {number} id - Site ID
     * @returns {Promise<void>}
     */
    static async delete(id) {
        try {
            const result = await db.run(
                'DELETE FROM site WHERE id = ?',
                [id]
            );

            if (result.changes === 0) {
                throw new NotFoundError('Site');
            }
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error deleting site');
        }
    }

    /**
     * Get all databases associated with a site
     * @param {number} siteId - Site ID
     * @returns {Promise<Array>} List of databases
     */
    static async getDatabases(siteId) {
        try {
            return await db.all(
                'SELECT * FROM database WHERE site_id = ?',
                [siteId]
            );
        } catch (error) {
            throw new DatabaseError('Error fetching site databases');
        }
    }

    /**
     * Get all certificates associated with a site
     * @param {number} siteId - Site ID
     * @returns {Promise<Array>} List of certificates
     */
    static async getCertificates(siteId) {
        try {
            return await db.all(
                'SELECT * FROM certificate WHERE site_id = ?',
                [siteId]
            );
        } catch (error) {
            throw new DatabaseError('Error fetching site certificates');
        }
    }
}