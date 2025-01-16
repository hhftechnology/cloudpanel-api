// src/models/Database.js
import { db } from '../config/database.js';
import { DatabaseError, NotFoundError } from '../middleware/errorHandler.js';

export class Database {
    /**
     * Find a database by its ID with optional related data
     * Optionally includes server and user information
     * @param {number} id - Database ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Database data
     */
    static async findById(id, options = {}) {
        try {
            let query = 'SELECT d.* FROM database d WHERE d.id = ?';
            
            if (options.includeServer) {
                query = `
                    SELECT d.*, ds.engine, ds.version, ds.host, ds.port
                    FROM database d
                    JOIN database_server ds ON d.database_server_id = ds.id
                    WHERE d.id = ?
                `;
            }

            if (options.includeUsers) {
                query = `
                    SELECT d.*, GROUP_CONCAT(du.user_name) as users
                    FROM database d
                    LEFT JOIN database_user du ON d.id = du.database_id
                    WHERE d.id = ?
                    GROUP BY d.id
                `;
            }

            const database = await db.get(query, [id]);
            if (!database) {
                throw new NotFoundError('Database');
            }

            return database;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error fetching database');
        }
    }

    /**
     * Create a new database with initial user if provided
     * Handles both database and user creation in a transaction
     * @param {Object} dbData - Database creation data
     * @param {Object} userData - Optional initial user data
     * @returns {Promise<Object>} Created database data
     */
    static async create(dbData, userData = null) {
        try {
            await db.run('BEGIN TRANSACTION');

            // Create database record
            const dbResult = await db.run(`
                INSERT INTO database (
                    site_id, database_server_id, name,
                    created_at, updated_at
                ) VALUES (?, ?, ?, datetime('now'), datetime('now'))
            `, [
                dbData.site_id,
                dbData.database_server_id,
                dbData.name
            ]);

            // Create initial user if provided
            if (userData) {
                await db.run(`
                    INSERT INTO database_user (
                        database_id, user_name, password,
                        permissions, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                `, [
                    dbResult.lastID,
                    userData.username,
                    userData.password,
                    userData.permissions || 'ALL PRIVILEGES'
                ]);
            }

            await db.run('COMMIT');
            return dbResult;
        } catch (error) {
            await db.run('ROLLBACK');
            throw new DatabaseError('Error creating database');
        }
    }

    /**
     * Get all databases for a specific site
     * @param {number} siteId - Site ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of databases
     */
    static async getBySiteId(siteId, options = {}) {
        try {
            let query = `
                SELECT d.*, COUNT(du.id) as user_count
                FROM database d
                LEFT JOIN database_user du ON d.id = du.database_id
                WHERE d.site_id = ?
                GROUP BY d.id
            `;

            return await db.all(query, [siteId]);
        } catch (error) {
            throw new DatabaseError('Error fetching site databases');
        }
    }

    /**
     * Add a new user to the database
     * @param {number} databaseId - Database ID
     * @param {Object} userData - User creation data
     * @returns {Promise<Object>} Created user data
     */
    static async addUser(databaseId, userData) {
        try {
            // Verify database exists
            const database = await this.findById(databaseId);

            // Create database user
            const result = await db.run(`
                INSERT INTO database_user (
                    database_id, user_name, password,
                    permissions, created_at, updated_at
                ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                databaseId,
                userData.username,
                userData.password,
                userData.permissions || 'SELECT, INSERT, UPDATE, DELETE'
            ]);

            return result;
        } catch (error) {
            throw new DatabaseError('Error adding database user');
        }
    }

    /**
     * Update database user permissions
     * @param {number} userId - Database user ID
     * @param {string} permissions - New permissions
     * @returns {Promise<Object>} Update result
     */
    static async updateUserPermissions(userId, permissions) {
        try {
            const result = await db.run(`
                UPDATE database_user
                SET permissions = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [permissions, userId]);

            if (result.changes === 0) {
                throw new NotFoundError('Database user');
            }

            return result;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error updating user permissions');
        }
    }

    /**
     * Delete a database and its associated users
     * @param {number} id - Database ID
     * @returns {Promise<void>}
     */
    static async delete(id) {
        try {
            await db.run('BEGIN TRANSACTION');

            // Delete associated users first
            await db.run(
                'DELETE FROM database_user WHERE database_id = ?',
                [id]
            );

            // Delete database record
            const result = await db.run(
                'DELETE FROM database d WHERE id = ?',
                [id]
            );

            if (result.changes === 0) {
                throw new NotFoundError('Database');
            }

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error deleting database');
        }
    }

    /**
     * Get all users for a specific database
     * @param {number} databaseId - Database ID
     * @returns {Promise<Array>} List of database users
     */
    static async getUsers(databaseId) {
        try {
            return await db.all(`
                SELECT id, user_name, permissions, created_at
                FROM database_user
                WHERE database_id = ?
            `, [databaseId]);
        } catch (error) {
            throw new DatabaseError('Error fetching database users');
        }
    }
}