// src/services/databaseService.js
import { db } from '../config/database.js';
import { handleDatabaseError } from '../middleware/errorHandler.js';
import crypto from 'crypto';

/**
 * Service layer for managing databases and database users in CloudPanel.
 * Handles creation, user management, and permissions for MySQL/MariaDB databases.
 * Provides atomic operations with transaction support for data consistency.
 */
class DatabaseService {
    /**
     * Creates a new database with optional initial user.
     * @param {Object} data Database creation parameters
     * @param {number} data.site_id Associated site ID
     * @param {string} data.name Database name
     * @param {Object} [data.user] Optional initial user configuration
     * @returns {Promise<Object>} Created database details
     */
    async createDatabase(data) {
        const { site_id, name, user } = data;

        // Validate database name format
        if (!/^[a-zA-Z0-9_]+$/.test(name)) {
            throw new Error('Invalid database name format');
        }

        // Check if database name is already taken
        const existingDb = await this.findByName(name);
        if (existingDb) {
            throw new Error('Database name already exists');
        }

        try {
            // Get default database server
            const dbServer = await this.getDefaultDatabaseServer();
            if (!dbServer) {
                throw new Error('No active database server found');
            }

            await db.run('BEGIN TRANSACTION');

            // Create database record
            const dbResult = await db.run(`
                INSERT INTO database (
                    site_id, database_server_id, name,
                    created_at, updated_at
                ) VALUES (?, ?, ?, datetime('now'), datetime('now'))
            `, [site_id, dbServer.id, name]);

            // Create initial user if requested
            let dbUser = null;
            if (user) {
                const { username, password } = user;
                
                // Generate secure password if not provided
                const finalPassword = password || crypto
                    .randomBytes(16)
                    .toString('hex');

                const userResult = await db.run(`
                    INSERT INTO database_user (
                        database_id, user_name, password,
                        permissions, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                `, [
                    dbResult.lastID,
                    username,
                    finalPassword,
                    'ALL PRIVILEGES'
                ]);

                dbUser = {
                    id: userResult.lastID,
                    username,
                    password: finalPassword
                };

                // Create the actual MySQL user and grant permissions
                await this.createMySQLUser(dbServer, username, finalPassword, name);
            }

            await db.run('COMMIT');

            return {
                id: dbResult.lastID,
                name,
                site_id,
                server: {
                    host: dbServer.host,
                    port: dbServer.port,
                    engine: dbServer.engine,
                    version: dbServer.version
                },
                user: dbUser
            };
        } catch (error) {
            await db.run('ROLLBACK');
            throw handleDatabaseError(error);
        }
    }

    /**
     * Retrieves a database by its unique name.
     * @param {string} name Database name to search for
     * @returns {Promise<Object|null>} Database record if found
     */
    async findByName(name) {
        return db.get(`
            SELECT d.*, ds.host, ds.port, ds.engine
            FROM database d
            JOIN database_server ds ON d.database_server_id = ds.id
            WHERE d.name = ?
        `, [name]);
    }

    /**
     * Retrieves a database by its ID with server information.
     * @param {number} id Database ID to search for
     * @returns {Promise<Object|null>} Database record if found
     */
    async findById(id) {
        return db.get(`
            SELECT d.*, ds.host, ds.port, ds.engine,
                   COUNT(du.id) as user_count
            FROM database d
            JOIN database_server ds ON d.database_server_id = ds.id
            LEFT JOIN database_user du ON d.id = du.database_id
            WHERE d.id = ?
            GROUP BY d.id
        `, [id]);
    }

    /**
     * Gets the default active database server configuration.
     * @returns {Promise<Object|null>} Database server configuration
     */
    async getDefaultDatabaseServer() {
        return db.get(`
            SELECT * FROM database_server 
            WHERE is_default = 1 AND is_active = 1
        `);
    }

    /**
     * Creates a MySQL user and grants permissions on the specified database.
     * @private
     */
    async createMySQLUser(server, username, password, dbName) {
        // Implementation would use mysql2 or similar to execute:
        // CREATE USER, GRANT statements
        // This is a placeholder for the actual MySQL user creation
        return true;
    }

    /**
     * Updates database user permissions.
     * @param {number} userId Database user ID
     * @param {string} permissions New permissions string
     * @returns {Promise<void>}
     */
    async updateUserPermissions(userId, permissions) {
        const user = await db.get(
            'SELECT * FROM database_user WHERE id = ?',
            [userId]
        );

        if (!user) {
            throw new Error('Database user not found');
        }

        try {
            await db.run('BEGIN TRANSACTION');

            // Update permissions in CloudPanel
            await db.run(`
                UPDATE database_user 
                SET permissions = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [permissions, userId]);

            // Update MySQL permissions
            // Implementation would update actual MySQL grants

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw handleDatabaseError(error);
        }
    }

    /**
     * Lists all databases for a specific site with their users.
     * @param {number} siteId Site ID to filter by
     * @returns {Promise<Array>} List of databases with user counts
     */
    async listSiteDatabases(siteId) {
        return db.all(`
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
    }

    /**
     * Deletes a database and all its users.
     * @param {number} databaseId Database ID to delete
     * @returns {Promise<void>}
     */
    async deleteDatabase(databaseId) {
        const database = await this.findById(databaseId);
        if (!database) {
            throw new Error('Database not found');
        }

        try {
            await db.run('BEGIN TRANSACTION');

            // Delete database users first
            await db.run(
                'DELETE FROM database_user WHERE database_id = ?',
                [databaseId]
            );

            // Delete database record
            await db.run(
                'DELETE FROM database WHERE id = ?',
                [databaseId]
            );

            // Drop actual MySQL database and users
            // Implementation would drop the MySQL database

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw handleDatabaseError(error);
        }
    }
}

export default new DatabaseService();