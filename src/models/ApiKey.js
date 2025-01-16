// src/models/ApiKey.js
import { db } from '../config/database.js';
import { DatabaseError, NotFoundError } from '../middleware/errorHandler.js';
import crypto from 'crypto';

export class ApiKey {
    // Define standard scopes for API access control
    static SCOPES = {
        ALL: '*',
        READ: 'read',
        WRITE: 'write',
        SITES: 'sites',
        DATABASES: 'databases',
        CERTIFICATES: 'certificates',
        USERS: 'users',
        MONITORING: 'monitoring'
    };

    /**
     * Generate a new API key with secure random bytes
     * Creates a key format that is both secure and user-friendly
     * Format: cp_live_[32 random chars]
     * @returns {string} Generated API key
     */
    static generateKey() {
        const randomBytes = crypto.randomBytes(24); // 24 bytes = 32 base64 chars
        return `cp_live_${randomBytes.toString('base64url')}`;
    }

    /**
     * Hash an API key for secure storage
     * Uses SHA-256 for one-way hashing of API keys
     * @param {string} apiKey - Raw API key to hash
     * @returns {string} Hashed API key
     */
    static hashKey(apiKey) {
        return crypto
            .createHash('sha256')
            .update(apiKey)
            .digest('hex');
    }

    /**
     * Create a new API key for a user
     * Handles both key generation and secure storage
     * @param {Object} keyData - API key creation data
     * @returns {Object} Created API key data and the raw key
     */
    static async create(keyData) {
        try {
            // Generate new API key
            const rawKey = this.generateKey();
            const hashedKey = this.hashKey(rawKey);

            // Store the hashed key
            const result = await db.run(`
                INSERT INTO api_token (
                    user_id, name, token, is_active,
                    scopes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                keyData.user_id,
                keyData.name,
                hashedKey,
                1, // Active by default
                Array.isArray(keyData.scopes) 
                    ? keyData.scopes.join(',') 
                    : keyData.scopes || '*'
            ]);

            // Return both the raw key (to be shown once) and the record data
            return {
                id: result.lastID,
                name: keyData.name,
                rawKey, // This should be shown to the user only once
                scopes: keyData.scopes,
                created_at: new Date().toISOString()
            };
        } catch (error) {
            throw new DatabaseError('Error creating API key');
        }
    }

    /**
     * Find an API key by its ID
     * Never returns the hashed key value for security
     * @param {number} id - API key ID
     * @returns {Promise<Object>} API key data
     */
    static async findById(id) {
        try {
            const apiKey = await db.get(`
                SELECT 
                    ak.id, ak.user_id, ak.name, ak.is_active,
                    ak.scopes, ak.created_at, ak.updated_at,
                    u.role as user_role
                FROM api_token ak
                JOIN user u ON ak.user_id = u.id
                WHERE ak.id = ?
            `, [id]);

            if (!apiKey) {
                throw new NotFoundError('API key');
            }

            return apiKey;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error fetching API key');
        }
    }

    /**
     * Verify an API key and return its associated data
     * Used in the authentication process
     * @param {string} rawKey - Raw API key to verify
     * @returns {Promise<Object>} API key data if valid
     */
    static async verify(rawKey) {
        try {
            const hashedKey = this.hashKey(rawKey);

            const apiKey = await db.get(`
                SELECT 
                    ak.id, ak.user_id, ak.name, ak.is_active,
                    ak.scopes, ak.created_at,
                    u.role as user_role
                FROM api_token ak
                JOIN user u ON ak.user_id = u.id
                WHERE ak.token = ? AND ak.is_active = 1
            `, [hashedKey]);

            return apiKey || null;
        } catch (error) {
            throw new DatabaseError('Error verifying API key');
        }
    }

    /**
     * Get all API keys for a user
     * @param {number} userId - User ID
     * @returns {Promise<Array>} List of API keys
     */
    static async getByUserId(userId) {
        try {
            return await db.all(`
                SELECT 
                    id, name, is_active, scopes,
                    created_at, updated_at
                FROM api_token
                WHERE user_id = ?
                ORDER BY created_at DESC
            `, [userId]);
        } catch (error) {
            throw new DatabaseError('Error fetching user API keys');
        }
    }

    /**
     * Deactivate an API key
     * Soft deletion approach for audit purposes
     * @param {number} id - API key ID
     * @returns {Promise<void>}
     */
    static async deactivate(id) {
        try {
            const result = await db.run(`
                UPDATE api_token
                SET is_active = 0, updated_at = datetime('now')
                WHERE id = ?
            `, [id]);

            if (result.changes === 0) {
                throw new NotFoundError('API key');
            }
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error deactivating API key');
        }
    }

    /**
     * Update API key scopes
     * @param {number} id - API key ID
     * @param {Array|string} scopes - New scopes to set
     * @returns {Promise<void>}
     */
    static async updateScopes(id, scopes) {
        try {
            const scopeString = Array.isArray(scopes) ? scopes.join(',') : scopes;
            
            const result = await db.run(`
                UPDATE api_token
                SET scopes = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [scopeString, id]);

            if (result.changes === 0) {
                throw new NotFoundError('API key');
            }
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            throw new DatabaseError('Error updating API key scopes');
        }
    }

    /**
     * Check if an API key has a specific scope
     * Handles both direct scope matches and wildcard permissions
     * @param {number} id - API key ID
     * @param {string} requiredScope - Scope to check for
     * @returns {Promise<boolean>} Whether the key has the required scope
     */
    static async hasScope(id, requiredScope) {
        try {
            const apiKey = await this.findById(id);
            
            if (!apiKey || !apiKey.is_active) {
                return false;
            }

            const scopes = apiKey.scopes.split(',');
            return scopes.includes('*') || scopes.includes(requiredScope);
        } catch (error) {
            return false;
        }
    }
}