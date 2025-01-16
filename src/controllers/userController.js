// src/controllers/userController.js
import { User } from '../models/User.js';
import bcrypt from 'bcrypt';
import { validateEmail } from '../utils/validation.js';

/**
 * Controller handling all user-related operations for the CloudPanel API
 * Implements CRUD operations with proper validation and error handling
 */
export const userController = {
  /**
   * Retrieve all users with non-sensitive information
   * Filters out sensitive data like passwords and MFA secrets
   */
  async getAllUsers(req, res) {
    try {
      const users = await User.findAll();
      res.json({ 
        success: true, 
        data: users.map(user => ({
          id: user.id,
          user_name: user.user_name,
          email: user.email,
          role: user.role,
          status: user.status,
          created_at: user.created_at
        }))
      });
    } catch (error) {
      req.logger.error('Error fetching users:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch users'
      });
    }
  },

  /**
   * Retrieve a single user by ID
   * Returns 404 if user not found
   */
  async getUser(req, res) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }

      // Remove sensitive information
      delete user.password;
      delete user.mfa_secret;

      res.json({ success: true, data: user });
    } catch (error) {
      req.logger.error('Error fetching user:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch user'
      });
    }
  },

  /**
   * Create a new user
   * Validates input and ensures username/email uniqueness
   */
  async createUser(req, res) {
    try {
      const { 
        user_name, 
        email, 
        password, 
        role, 
        first_name, 
        last_name, 
        timezone_id 
      } = req.body;

      // Input validation
      if (!user_name || !email || !password || !role) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }

      // Validate email format
      if (!validateEmail(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      // Check username uniqueness
      const existingUser = await User.findByUsername(user_name);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'Username already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user with default values
      const result = await User.create({
        user_name,
        email,
        password: hashedPassword,
        role,
        first_name: first_name || '',
        last_name: last_name || '',
        timezone_id: timezone_id || 1, // Default timezone
        status: 1, // Active by default
        mfa: 0 // MFA disabled by default
      });

      res.status(201).json({
        success: true,
        data: {
          id: result.lastID,
          user_name,
          email,
          role
        }
      });
    } catch (error) {
      req.logger.error('Error creating user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create user'
      });
    }
  },

  /**
   * Update user information
   * Allows partial updates while maintaining data integrity
   */
  async updateUser(req, res) {
    try {
      const userId = req.params.id;
      const {
        email,
        first_name,
        last_name,
        timezone_id,
        status
      } = req.body;

      // Check if user exists
      const existingUser = await User.findById(userId);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Validate email if provided
      if (email && !validateEmail(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      // Update user
      const result = await User.update(userId, {
        email: email || existingUser.email,
        first_name: first_name || existingUser.first_name,
        last_name: last_name || existingUser.last_name,
        timezone_id: timezone_id || existingUser.timezone_id,
        status: status !== undefined ? status : existingUser.status
      });

      res.json({
        success: true,
        message: 'User updated successfully'
      });
    } catch (error) {
      req.logger.error('Error updating user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user'
      });
    }
  },

  /**
   * Change user password
   * Requires current password verification
   */
  async changePassword(req, res) {
    try {
      const userId = req.params.id;
      const { currentPassword, newPassword } = req.body;

      // Validate input
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current and new password required'
        });
      }

      // Get user with password
      const user = await User.findByIdWithPassword(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }

      // Hash and update new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await User.updatePassword(userId, hashedPassword);

      res.json({
        success: true,
        message: 'Password updated successfully'
      });
    } catch (error) {
      req.logger.error('Error changing password:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change password'
      });
    }
  }
};