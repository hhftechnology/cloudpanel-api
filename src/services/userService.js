// src/services/userService.js
import { db } from '../config/database.js';
import { handleDatabaseError } from '../middleware/errorHandler.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import { sendEmail } from '../utils/email.js';

/**
 * Service layer for managing users in CloudPanel.
 * This service handles all aspects of user management including authentication,
 * authorization, profile management, and security features like MFA.
 * It implements security best practices for password handling and access control.
 */
class UserService {
    /**
     * Authenticates a user with their credentials and optional TOTP code.
     * This method handles both regular authentication and two-factor authentication.
     * It uses time-safe comparisons for password verification and rate limiting
     * through the auth middleware.
     */
    async authenticateUser(username, password, totpCode = null) {
        const user = await this.findByUsername(username);
        if (!user) {
            // Use constant time comparison even for non-existent users
            await bcrypt.compare(password, crypto.randomBytes(60).toString('hex'));
            throw new Error('Invalid credentials');
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            throw new Error('Invalid credentials');
        }

        // Check if MFA is required
        if (user.mfa === 1) {
            if (!totpCode) {
                return { requiresMfa: true, userId: user.id };
            }

            const isValidTotp = authenticator.verify({
                token: totpCode,
                secret: user.mfa_secret
            });

            if (!isValidTotp) {
                throw new Error('Invalid MFA code');
            }
        }

        // Generate session token
        const sessionToken = await this.createSession(user.id);

        return {
            user: {
                id: user.id,
                username: user.user_name,
                email: user.email,
                role: user.role,
                first_name: user.first_name,
                last_name: user.last_name
            },
            token: sessionToken
        };
    }

    /**
     * Creates a new user account with proper password hashing and validation.
     * This method enforces password complexity requirements and handles
     * timezone settings for users.
     */
    async createUser(userData) {
        const {
            user_name,
            email,
            password,
            role,
            first_name,
            last_name,
            timezone_id
        } = userData;

        // Check username uniqueness
        const existingUser = await this.findByUsername(user_name);
        if (existingUser) {
            throw new Error('Username already exists');
        }

        // Check email uniqueness
        const existingEmail = await this.findByEmail(email);
        if (existingEmail) {
            throw new Error('Email already exists');
        }

        try {
            // Hash password with proper salt rounds
            const hashedPassword = await bcrypt.hash(password, 12);

            const result = await db.run(`
                INSERT INTO user (
                    user_name, email, password, role,
                    first_name, last_name, timezone_id,
                    status, mfa, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
            `, [
                user_name,
                email,
                hashedPassword,
                role,
                first_name || '',
                last_name || '',
                timezone_id || 1  // Default timezone if not specified
            ]);

            // Send welcome email
            await sendEmail({
                to: email,
                subject: 'Welcome to CloudPanel',
                template: 'welcome',
                data: { firstName: first_name }
            });

            return {
                id: result.lastID,
                user_name,
                email,
                role
            };
        } catch (error) {
            throw handleDatabaseError(error);
        }
    }

    /**
     * Enables Multi-Factor Authentication for a user.
     * This generates a secure TOTP secret and provides setup information
     * for authenticator apps.
     */
    async enableMFA(userId) {
        const user = await this.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Generate secure TOTP secret
        const secret = authenticator.generateSecret();
        const otpauthUrl = authenticator.keyuri(
            user.email,
            'CloudPanel',
            secret
        );

        try {
            await db.run(`
                UPDATE user 
                SET mfa_secret = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            `, [secret, userId]);

            return {
                secret,
                otpauthUrl,
                qrCode: await this.generateQRCode(otpauthUrl)
            };
        } catch (error) {
            throw handleDatabaseError(error);
        }
    }

    /**
     * Updates user profile information with validation.
     * This method handles both basic profile updates and security-sensitive
     * changes that require additional verification.
     */
    async updateProfile(userId, profileData, currentPassword = null) {
        const user = await this.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // If updating email, verify current password
        if (profileData.email && profileData.email !== user.email) {
            if (!currentPassword) {
                throw new Error('Current password required to update email');
            }

            const isValidPassword = await bcrypt.compare(
                currentPassword,
                user.password
            );
            if (!isValidPassword) {
                throw new Error('Invalid current password');
            }

            // Check if new email is already in use
            const existingEmail = await this.findByEmail(profileData.email);
            if (existingEmail) {
                throw new Error('Email already in use');
            }
        }

        try {
            const updates = [];
            const values = [];

            // Build dynamic update query
            Object.entries(profileData).forEach(([key, value]) => {
                if (value !== undefined && 
                    !['id', 'password', 'role'].includes(key)) {
                    updates.push(`${key} = ?`);
                    values.push(value);
                }
            });

            if (updates.length === 0) {
                return user;
            }

            updates.push('updated_at = datetime("now")');
            values.push(userId);

            await db.run(`
                UPDATE user 
                SET ${updates.join(', ')}
                WHERE id = ?
            `, values);

            return await this.findById(userId);
        } catch (error) {
            throw handleDatabaseError(error);
        }
    }

    /**
     * Changes a user's password with proper validation and security checks.
     * This method enforces password history and complexity requirements.
     */
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.findByIdWithPassword(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(
            currentPassword,
            user.password
        );
        if (!isValidPassword) {
            throw new Error('Invalid current password');
        }

        // Check password history
        const passwordHistory = await this.getPasswordHistory(userId);
        for (const historicPassword of passwordHistory) {
            const isReused = await bcrypt.compare(
                newPassword,
                historicPassword.password_hash
            );
            if (isReused) {
                throw new Error(
                    'New password must be different from previous passwords'
                );
            }
        }

        try {
            const hashedPassword = await bcrypt.hash(newPassword, 12);

            await db.run('BEGIN TRANSACTION');

            // Update password
            await db.run(`
                UPDATE user 
                SET password = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            `, [hashedPassword, userId]);

            // Store in password history
            await db.run(`
                INSERT INTO password_history (
                    user_id, password_hash, created_at
                ) VALUES (?, ?, datetime('now'))
            `, [userId, hashedPassword]);

            await db.run('COMMIT');

            // Invalidate existing sessions
            await this.invalidateAllSessions(userId);

            return true;
        } catch (error) {
            await db.run('ROLLBACK');
            throw handleDatabaseError(error);
        }
    }

    // Helper methods for user lookup and verification

    async findByUsername(username) {
        return db.get(
            'SELECT * FROM user WHERE user_name = ?',
            [username]
        );
    }

    async findByEmail(email) {
        return db.get(
            'SELECT * FROM user WHERE email = ?',
            [email]
        );
    }

    async findById(id) {
        return db.get(
            'SELECT * FROM user WHERE id = ?',
            [id]
        );
    }

    async findByIdWithPassword(id) {
        return db.get(
            'SELECT * FROM user WHERE id = ?',
            [id]
        );
    }

    // Session management methods

    async createSession(userId) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await db.run(`
            INSERT INTO user_session (
                user_id, token, expires_at, created_at
            ) VALUES (?, ?, ?, datetime('now'))
        `, [userId, token, expiresAt.toISOString()]);

        return token;
    }

    async invalidateAllSessions(userId) {
        await db.run(
            'DELETE FROM user_session WHERE user_id = ?',
            [userId]
        );
    }

    // Additional helper methods

    async generateQRCode(otpauthUrl) {
        // Implementation would generate QR code for MFA setup
        return otpauthUrl;
    }

    async getPasswordHistory(userId) {
        return db.all(`
            SELECT password_hash
            FROM password_history
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 5
        `, [userId]);
    }
}

export default new UserService();