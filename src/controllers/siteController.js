// src/controllers/siteController.js
import { Site } from '../models/Site.js';
import { validateDomain } from '../utils/validation.js';
import { createDirectory, setPermissions } from '../utils/filesystem.js';
import path from 'path';

/**
 * Controller for managing websites in CloudPanel
 * Handles all aspects of site creation, configuration, and management
 * Integrates with multiple tables:
 * - site: Core website information
 * - php_settings: PHP-FPM configurations
 * - vhost_template: Nginx virtual host templates
 */
export const siteController = {
    /**
     * Retrieve all sites with their configurations
     * Includes PHP settings and template information
     */
    async getAllSites(req, res) {
        try {
            const sites = await db.all(`
                SELECT 
                    s.id, s.domain_name, s.type, s.root_directory,
                    s.user, s.created_at, s.application,
                    s.page_speed_enabled, s.varnish_cache,
                    ps.php_version, ps.memory_limit,
                    ps.max_execution_time
                FROM site s
                LEFT JOIN php_settings ps ON s.php_settings_id = ps.id
                ORDER BY s.domain_name
            `);

            res.json({
                success: true,
                data: sites
            });
        } catch (error) {
            req.logger.error('Error fetching sites:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch sites'
            });
        }
    },

    /**
     * Create a new website with all necessary configurations
     * Handles directory creation, PHP settings, and vhost setup
     */
    async createSite(req, res) {
        try {
            const {
                domain_name,
                type,
                php_version,
                application,
                varnish_cache = false,
                page_speed_enabled = false
            } = req.body;

            // Validate domain name
            if (!validateDomain(domain_name)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid domain name'
                });
            }

            // Check domain availability
            const existingSite = await Site.findByDomain(domain_name);
            if (existingSite) {
                return res.status(409).json({
                    success: false,
                    error: 'Domain already exists'
                });
            }

            // Get appropriate vhost template
            const template = await db.get(`
                SELECT id, template 
                FROM vhost_template 
                WHERE type = ? AND php_version = ?
                ORDER BY created_at DESC 
                LIMIT 1
            `, [type, php_version]);

            if (!template) {
                return res.status(400).json({
                    success: false,
                    error: 'No suitable vhost template found'
                });
            }

            // Start transaction
            await db.run('BEGIN TRANSACTION');

            try {
                // Create site directories
                const rootDirectory = path.join('/home', domain_name, 'htdocs');
                await createDirectory(rootDirectory);
                await setPermissions(rootDirectory, domain_name);

                // Create PHP-FPM settings
                const phpSettings = await db.run(`
                    INSERT INTO php_settings (
                        php_version, memory_limit, max_execution_time,
                        max_input_time, max_input_vars, post_max_size,
                        upload_max_file_size, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                `, [
                    php_version,
                    '256M',      // Default memory limit
                    30,          // Default max execution time
                    60,          // Default max input time
                    1000,        // Default max input vars
                    '64M',       // Default post max size
                    '64M'        // Default upload max file size
                ]);

                // Create site record
                const site = await db.run(`
                    INSERT INTO site (
                        domain_name, type, root_directory, user,
                        php_settings_id, vhost_template,
                        application, page_speed_enabled,
                        varnish_cache, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                `, [
                    domain_name,
                    type,
                    rootDirectory,
                    domain_name,
                    phpSettings.lastID,
                    template.template,
                    application,
                    page_speed_enabled ? 1 : 0,
                    varnish_cache ? 1 : 0
                ]);

                await db.run('COMMIT');

                res.status(201).json({
                    success: true,
                    data: {
                        id: site.lastID,
                        domain_name,
                        type,
                        root_directory: rootDirectory,
                        php_version,
                        application
                    }
                });
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            req.logger.error('Error creating site:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create site'
            });
        }
    },

    /**
     * Update website configuration
     * Handles PHP settings and cache configuration updates
     */
    async updateSite(req, res) {
        try {
            const { id } = req.params;
            const {
                php_settings,
                varnish_cache,
                page_speed_enabled
            } = req.body;

            // Verify site exists
            const site = await Site.findById(id);
            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found'
                });
            }

            await db.run('BEGIN TRANSACTION');

            try {
                // Update PHP settings if provided
                if (php_settings) {
                    const {
                        memory_limit,
                        max_execution_time,
                        max_input_vars,
                        post_max_size,
                        upload_max_file_size
                    } = php_settings;

                    await db.run(`
                        UPDATE php_settings
                        SET 
                            memory_limit = COALESCE(?, memory_limit),
                            max_execution_time = COALESCE(?, max_execution_time),
                            max_input_vars = COALESCE(?, max_input_vars),
                            post_max_size = COALESCE(?, post_max_size),
                            upload_max_file_size = COALESCE(?, upload_max_file_size),
                            updated_at = datetime('now')
                        WHERE id = ?
                    `, [
                        memory_limit,
                        max_execution_time,
                        max_input_vars,
                        post_max_size,
                        upload_max_file_size,
                        site.php_settings_id
                    ]);
                }

                // Update site configuration
                await db.run(`
                    UPDATE site
                    SET 
                        varnish_cache = COALESCE(?, varnish_cache),
                        page_speed_enabled = COALESCE(?, page_speed_enabled),
                        updated_at = datetime('now')
                    WHERE id = ?
                `, [
                    varnish_cache !== undefined ? (varnish_cache ? 1 : 0) : null,
                    page_speed_enabled !== undefined ? (page_speed_enabled ? 1 : 0) : null,
                    id
                ]);

                await db.run('COMMIT');

                res.json({
                    success: true,
                    message: 'Site updated successfully'
                });
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            req.logger.error('Error updating site:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update site'
            });
        }
    },

    /**
     * Delete a website and its associated configurations
     * Handles cleanup of all related resources
     */
    async deleteSite(req, res) {
        try {
            const { id } = req.params;

            const site = await Site.findById(id);
            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found'
                });
            }

            await db.run('BEGIN TRANSACTION');

            try {
                // Delete PHP settings
                if (site.php_settings_id) {
                    await db.run(
                        'DELETE FROM php_settings WHERE id = ?',
                        [site.php_settings_id]
                    );
                }

                // Delete site record
                await db.run('DELETE FROM site WHERE id = ?', [id]);

                await db.run('COMMIT');

                res.json({
                    success: true,
                    message: 'Site deleted successfully'
                });
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            req.logger.error('Error deleting site:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete site'
            });
        }
    }
};