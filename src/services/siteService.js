// src/services/siteService.js
import { db } from '../config/database.js';
import { handleDatabaseError } from '../middleware/errorHandler.js';
import { validateDomain } from '../utils/validation.js';
import { createDirectory, setPermissions } from '../utils/filesystem.js';
import path from 'path';

/**
 * Service layer for managing website operations in CloudPanel.
 * Handles complex business logic and database interactions for site management.
 */
class SiteService {
    /**
     * Creates a new website with all necessary configurations and directory structure.
     * This is a complex operation that involves multiple steps and database transactions.
     */
    async createSite(siteData) {
        const {
            domain_name,
            type,
            php_version,
            application,
            varnish_cache = false,
            page_speed_enabled = false
        } = siteData;

        // Validate domain name format
        if (!validateDomain(domain_name)) {
            throw new Error('Invalid domain name format');
        }

        // Check domain availability
        const existingSite = await this.findByDomain(domain_name);
        if (existingSite) {
            throw new Error('Domain already exists');
        }

        // Get appropriate vhost template
        const template = await this.getVhostTemplate(type, php_version);
        if (!template) {
            throw new Error('No suitable vhost template found');
        }

        try {
            // Start transaction for atomic site creation
            await db.run('BEGIN TRANSACTION');

            // Create site directories
            const rootDirectory = path.join('/home', domain_name, 'htdocs');
            await createDirectory(rootDirectory);
            await setPermissions(rootDirectory, domain_name);

            // Create PHP settings if needed
            let phpSettingsId = null;
            if (type === 'php') {
                phpSettingsId = await this.createPhpSettings(php_version);
            }

            // Create site record
            const siteResult = await db.run(`
                INSERT INTO site (
                    domain_name, type, root_directory, user,
                    php_settings_id, vhost_template, application,
                    page_speed_enabled, varnish_cache,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                domain_name,
                type,
                rootDirectory,
                domain_name,
                phpSettingsId,
                template.template,
                application,
                page_speed_enabled ? 1 : 0,
                varnish_cache ? 1 : 0
            ]);

            await db.run('COMMIT');

            return {
                id: siteResult.lastID,
                domain_name,
                type,
                root_directory: rootDirectory,
                php_version: type === 'php' ? php_version : null,
                application
            };
        } catch (error) {
            await db.run('ROLLBACK');
            throw handleDatabaseError(error);
        }
    }

    /**
     * Updates site configuration and related settings.
     * Handles both site-specific and PHP settings updates.
     */
    async updateSite(siteId, updateData) {
        const site = await this.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        try {
            await db.run('BEGIN TRANSACTION');

            // Update PHP settings if provided and site is PHP-based
            if (updateData.php_settings && site.php_settings_id) {
                await this.updatePhpSettings(
                    site.php_settings_id,
                    updateData.php_settings
                );
            }

            // Update site configuration
            const updates = [];
            const values = [];
            
            if (updateData.varnish_cache !== undefined) {
                updates.push('varnish_cache = ?');
                values.push(updateData.varnish_cache ? 1 : 0);
            }
            
            if (updateData.page_speed_enabled !== undefined) {
                updates.push('page_speed_enabled = ?');
                values.push(updateData.page_speed_enabled ? 1 : 0);
            }

            if (updates.length > 0) {
                updates.push('updated_at = datetime("now")');
                values.push(siteId);

                await db.run(`
                    UPDATE site
                    SET ${updates.join(', ')}
                    WHERE id = ?
                `, values);
            }

            await db.run('COMMIT');
            return await this.findById(siteId);
        } catch (error) {
            await db.run('ROLLBACK');
            throw handleDatabaseError(error);
        }
    }

    /**
     * Retrieves a site by its domain name.
     * Used for domain availability checking and site lookup.
     */
    async findByDomain(domainName) {
        return db.get(
            'SELECT * FROM site WHERE domain_name = ?',
            [domainName]
        );
    }

    /**
     * Retrieves a site by its ID with all related configurations.
     * Includes PHP settings if applicable.
     */
    async findById(id) {
        return db.get(`
            SELECT 
                s.*,
                ps.php_version,
                ps.memory_limit,
                ps.max_execution_time
            FROM site s
            LEFT JOIN php_settings ps ON s.php_settings_id = ps.id
            WHERE s.id = ?
        `, [id]);
    }

    /**
     * Creates PHP-FPM settings for a site.
     * Uses sensible defaults with option for customization.
     */
    async createPhpSettings(phpVersion) {
        const result = await db.run(`
            INSERT INTO php_settings (
                php_version, memory_limit, max_execution_time,
                max_input_time, max_input_vars, post_max_size,
                upload_max_file_size, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
            phpVersion,
            '256M',      // Default memory limit
            30,          // Default max execution time
            60,          // Default max input time
            1000,        // Default max input vars
            '64M',       // Default post max size
            '64M'        // Default upload max file size
        ]);

        return result.lastID;
    }

    /**
     * Updates PHP settings for a site.
     * Validates and applies new PHP configuration values.
     */
    async updatePhpSettings(settingsId, settings) {
        const updates = [];
        const values = [];

        // Build dynamic update query based on provided settings
        Object.entries(settings).forEach(([key, value]) => {
            if (value !== undefined) {
                updates.push(`${key} = ?`);
                values.push(value);
            }
        });

        if (updates.length === 0) {
            return;
        }

        updates.push('updated_at = datetime("now")');
        values.push(settingsId);

        await db.run(`
            UPDATE php_settings
            SET ${updates.join(', ')}
            WHERE id = ?
        `, values);
    }

    /**
     * Retrieves an appropriate vhost template based on site type and PHP version.
     * Templates are versioned and type-specific.
     */
    async getVhostTemplate(type, phpVersion = null) {
        let query = 'SELECT * FROM vhost_template WHERE type = ?';
        const params = [type];

        if (phpVersion) {
            query += ' AND php_version = ?';
            params.push(phpVersion);
        }

        query += ' ORDER BY created_at DESC LIMIT 1';
        return db.get(query, params);
    }

    /**
     * Retrieves all sites with their configurations.
     * Supports filtering and pagination.
     */
    async getAllSites(options = {}) {
        const {
            page = 1,
            limit = 10,
            type = null,
            withPhpSettings = false
        } = options;

        const offset = (page - 1) * limit;
        let query = `
            SELECT 
                s.*,
                ${withPhpSettings ? 'ps.php_version, ps.memory_limit,' : ''}
                COUNT(*) OVER() as total_count
            FROM site s
        `;

        if (withPhpSettings) {
            query += ' LEFT JOIN php_settings ps ON s.php_settings_id = ps.id';
        }

        if (type) {
            query += ' WHERE s.type = ?';
        }

        query += ` ORDER BY s.domain_name LIMIT ? OFFSET ?`;

        const params = type 
            ? [type, limit, offset]
            : [limit, offset];

        const sites = await db.all(query, params);
        
        return {
            sites: sites.map(site => {
                const { total_count, ...siteData } = site;
                return siteData;
            }),
            pagination: {
                total: sites[0]?.total_count || 0,
                page,
                limit,
                pages: Math.ceil((sites[0]?.total_count || 0) / limit)
            }
        };
    }

    /**
     * Deletes a site and all associated resources.
     * This includes database users, PHP settings, and certificates.
     */
    async deleteSite(siteId) {
        const site = await this.findById(siteId);
        if (!site) {
            throw new Error('Site not found');
        }

        try {
            await db.run('BEGIN TRANSACTION');

            // Delete PHP settings if they exist
            if (site.php_settings_id) {
                await db.run(
                    'DELETE FROM php_settings WHERE id = ?',
                    [site.php_settings_id]
                );
            }

            // Delete associated databases and users
            const databases = await db.all(
                'SELECT id FROM database WHERE site_id = ?',
                [siteId]
            );

            for (const database of databases) {
                await db.run(
                    'DELETE FROM database_user WHERE database_id = ?',
                    [database.id]
                );
                await db.run(
                    'DELETE FROM database WHERE id = ?',
                    [database.id]
                );
            }

            // Delete SSL certificates
            await db.run(
                'DELETE FROM certificate WHERE site_id = ?',
                [siteId]
            );

            // Finally, delete the site
            await db.run('DELETE FROM site WHERE id = ?', [siteId]);

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw handleDatabaseError(error);
        }
    }
}

export default new SiteService();