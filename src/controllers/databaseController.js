// src/controllers/databaseController.js
import { Database } from '../models/Database.js';
import { Site } from '../models/Site.js';
import crypto from 'crypto';

/**
 * Controller for managing databases and database users in CloudPanel
 * Handles database creation, user management, and permissions
 * Integrates with the following tables:
 * - database: Main database information
 * - database_server: Database server configurations
 * - database_user: Database user credentials and permissions
 */
export const databaseController = {
    /**
     * Retrieve all databases for a site with their associated users
     * Excludes sensitive information like passwords
     */
    async getSiteDatabases(req, res) {
        try {
            const siteId = req.params.siteId;

            // Verify site exists
            const site = await Site.findById(siteId);
            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found'
                });
            }

            // Get databases with server information
            const databases = await db.all(`
                SELECT 
                    d.id, d.name, d.created_at,
                    ds.engine, ds.version,
                    COUNT(du.id) as user_count
                FROM database d
                JOIN database_server ds ON d.database_server_id = ds.id
                LEFT JOIN database_user du ON d.id = du.database_id
                WHERE d.site_id = ?
                GROUP BY d.id
            `, [siteId]);

            res.json({
                success: true,
                data: databases
            });
        } catch (error) {
            req.logger.error('Error fetching databases:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch databases'
            });
        }
    },

    /**
     * Create a new database with an optional initial user
     * Handles both database and user creation in a transaction
     */
    async createDatabase(req, res) {
        try {
            const { site_id, name, user } = req.body;

            // Validate database name
            if (!/^[a-zA-Z0-9_]+$/.test(name)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid database name. Use only letters, numbers, and underscores'
                });
            }

            // Check site exists
            const site = await Site.findById(site_id);
            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found'
                });
            }

            // Get default database server
            const dbServer = await db.get(`
                SELECT id FROM database_server 
                WHERE is_default = 1 AND is_active = 1
            `);

            if (!dbServer) {
                return res.status(500).json({
                    success: false,
                    error: 'No active database server found'
                });
            }

            // Start transaction
            await db.run('BEGIN TRANSACTION');

            try {
                // Create database
                const dbResult = await db.run(`
                    INSERT INTO database (
                        site_id, database_server_id, name, created_at, updated_at
                    ) VALUES (?, ?, ?, datetime('now'), datetime('now'))
                `, [site_id, dbServer.id, name]);

                // Create database user if requested
                if (user) {
                    const { username, password } = user;
                    
                    // Generate secure password if not provided
                    const finalPassword = password || crypto
                        .randomBytes(16)
                        .toString('hex');

                    await db.run(`
                        INSERT INTO database_user (
                            database_id, user_name, password, permissions,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                    `, [
                        dbResult.lastID,
                        username,
                        finalPassword,
                        'ALL PRIVILEGES'
                    ]);
                }

                await db.run('COMMIT');

                res.status(201).json({
                    success: true,
                    data: {
                        id: dbResult.lastID,
                        name,
                        site_id,
                        created_at: new Date().toISOString()
                    }
                });
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            req.logger.error('Error creating database:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create database'
            });
        }
    },

    /**
     * Add a new user to an existing database
     * Manages user creation and permission assignment
     */
    async addDatabaseUser(req, res) {
        try {
            const { database_id } = req.params;
            const { username, password, permissions } = req.body;

            // Validate input
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Username and password are required'
                });
            }

            // Check database exists
            const database = await db.get(
                'SELECT id FROM database WHERE id = ?',
                [database_id]
            );

            if (!database) {
                return res.status(404).json({
                    success: false,
                    error: 'Database not found'
                });
            }

            // Check username uniqueness for this database
            const existingUser = await db.get(`
                SELECT id FROM database_user 
                WHERE database_id = ? AND user_name = ?
            `, [database_id, username]);

            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    error: 'Username already exists for this database'
                });
            }

            // Create database user
            const result = await db.run(`
                INSERT INTO database_user (
                    database_id, user_name, password, permissions,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                database_id,
                username,
                password,
                permissions || 'SELECT, INSERT, UPDATE, DELETE'
            ]);

            res.status(201).json({
                success: true,
                data: {
                    id: result.lastID,
                    database_id,
                    username,
                    permissions: permissions || 'SELECT, INSERT, UPDATE, DELETE'
                }
            });
        } catch (error) {
            req.logger.error('Error adding database user:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add database user'
            });
        }
    },

    /**
     * Update database user permissions
     * Manages permission modifications for existing users
     */
    async updateUserPermissions(req, res) {
        try {
            const { user_id } = req.params;
            const { permissions } = req.body;

            if (!permissions) {
                return res.status(400).json({
                    success: false,
                    error: 'Permissions are required'
                });
            }

            // Update permissions
            const result = await db.run(`
                UPDATE database_user 
                SET permissions = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [permissions, user_id]);

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Database user not found'
                });
            }

            res.json({
                success: true,
                message: 'Permissions updated successfully'
            });
        } catch (error) {
            req.logger.error('Error updating permissions:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update permissions'
            });
        }
    }
};