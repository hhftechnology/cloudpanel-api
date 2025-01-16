// src/models/User.js
import { db } from '../config/database.js';
import { DatabaseError, NotFoundError } from '../middleware/errorHandler.js';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';

export class User {
    /**
     * Find a user by ID, excluding sensitive data by default
     * This is the primary method for fetching user data safely
     * @param {number} id - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User data
     */
    static async findById(id, options = {}) {
        try {
            let fields = `
                id, user_name, email, first_name, last_name,
                role, status, timezone_id, created_at
            `;
            
            // Include sensitive fields if specifically requested
            if (options.includeSensitive) {
                fields += ', password, mfa, mfa_secret';
            }

            const query = `
                SELECT ${fields}
                FROM user
                WHERE id = ?
            `;

            const user = await db.get(query, [id]);
            if (!user) {
                throw new NotFoundError('User');
            }

            // Include timezone information if requested
            if (options.includeTimezone && user.timezone_id) {
                const timezone = await db.get(
                    'SELECT name FROM timezone WHERE id = ?',
                    [user.timezone_id]
                );
                user.timezone = timezone ? timezone.name : null;
            }

            return user;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error fetching user');
        }
    }

    /**
     * Find a user by username, including password for authentication
     * This method is specifically designed for authentication flows
     * @param {string} username - Username to search for
     * @returns {Promise<Object>} User data with password
     */
    static async findByUsername(username) {
        try {
            return await db.get(`
                SELECT id, user_name, password, role, status,
                       mfa, mfa_secret
                FROM user
                WHERE user_name = ?
            `, [username]);
        } catch (error) {
            throw new DatabaseError('Error fetching user by username');
        }
    }

    /**
     * Create a new user with secure password hashing
     * Handles both basic user creation and optional MFA setup
     * @param {Object} userData - User creation data
     * @returns {Promise<Object>} Created user data
     */
    static async create(userData) {
        try {
            // Hash password before storage
            const hashedPassword = await bcrypt.hash(userData.password, 10);

            // Generate MFA secret if MFA is enabled
            const mfaSecret = userData.mfa ? authenticator.generateSecret() : null;

            const result = await db.run(`
                INSERT INTO user (
                    user_name, email, password, role,
                    first_name, last_name, timezone_id,
                    mfa, mfa_secret, status,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                         datetime('now'), datetime('now'))
            `, [
                userData.user_name,
                userData.email,
                hashedPassword,
                userData.role,
                userData.first_name || '',
                userData.last_name || '',
                userData.timezone_id || 1,
                userData.mfa ? 1 : 0,
                mfaSecret,
                userData.status || 1
            ]);

            // Return created user without sensitive data
            return this.findById(result.lastID);
        } catch (error) {
            throw new DatabaseError('Error creating user');
        }
    }

    /**
     * Update user information with proper validation
     * Handles partial updates and password changes separately
     * @param {number} id - User ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Update result
     */
    static async update(id, updateData) {
        try {
            const sets = [];
            const values = [];

            // Handle each updateable field
            Object.entries(updateData).forEach(([key, value]) => {
                // Skip password updates (handled separately)
                if (key === 'password') return;
                
                sets.push(`${key} = ?`);
                values.push(value);
            });
            
            sets.push('updated_at = datetime("now")');
            values.push(id);

            const result = await db.run(`
                UPDATE user
                SET ${sets.join(', ')}
                WHERE id = ?
            `, values);

            if (result.changes === 0) {
                throw new NotFoundError('User');
            }

            return result;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error updating user');
        }
    }

    /**
     * Update user password with secure hashing
     * Separate method for password updates to ensure security
     * @param {number} id - User ID
     * @param {string} newPassword - New password to set
     * @returns {Promise<void>}
     */
    static async updatePassword(id, newPassword) {
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            const result = await db.run(`
                UPDATE user
                SET password = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [hashedPassword, id]);

            if (result.changes === 0) {
                throw new NotFoundError('User');
            }
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error updating password');
        }
    }

    /**
     * Enable or update MFA for a user
     * Generates new MFA secret and updates user settings
     * @param {number} id - User ID
     * @returns {Promise<string>} New MFA secret for QR code generation
     */
    static async enableMFA(id) {
        try {
            const mfaSecret = authenticator.generateSecret();
            
            const result = await db.run(`
                UPDATE user
                SET mfa = 1, mfa_secret = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [mfaSecret, id]);

            if (result.changes === 0) {
                throw new NotFoundError('User');
            }

            return mfaSecret;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error enabling MFA');
        }
    }

    /**
     * Disable MFA for a user
     * Removes MFA secret and updates settings
     * @param {number} id - User ID
     * @returns {Promise<void>}
     */
    static async disableMFA(id) {
        try {
            const result = await db.run(`
                UPDATE user
                SET mfa = 0, mfa_secret = NULL, updated_at = datetime('now')
                WHERE id = ?
            `, [id]);

            if (result.changes === 0) {
                throw new NotFoundError('User');
            }
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error disabling MFA');
        }
    }

    /**
     * Verify MFA token for a user
     * @param {number} id - User ID
     * @param {string} token - MFA token to verify
     * @returns {Promise<boolean>} Verification result
     */
    static async verifyMFAToken(id, token) {
        try {
            const user = await this.findById(id, { includeSensitive: true });
            
            if (!user.mfa || !user.mfa_secret) {
                return false;
            }

            return authenticator.verify({
                token,
                secret: user.mfa_secret
            });
        } catch (error) {
            throw new DatabaseError('Error verifying MFA token');
        }
    }

    /**
     * Get all sites accessible to a user
     * @param {number} userId - User ID
     * @returns {Promise<Array>} List of accessible sites
     */
    static async getAccessibleSites(userId) {
        try {
            return await db.all(`
                SELECT s.*
                FROM site s
                JOIN user_sites us ON s.id = us.site_id
                WHERE us.user_id = ?
            `, [userId]);
        } catch (error) {
            throw new DatabaseError('Error fetching accessible sites');
        }
    }
}