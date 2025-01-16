// src/utils/email.js
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs/promises';
import Handlebars from 'handlebars';
import { maskSensitiveData } from './helpers.js';

/**
 * Manages email configuration and templating for CloudPanel.
 * Provides a centralized way to send formatted emails using templates.
 */
class EmailService {
    constructor() {
        this.transporter = null;
        this.templateCache = new Map();
        this.defaultFrom = process.env.MAIL_FROM || 'CloudPanel <noreply@localhost>';
        this.templatesDir = path.join(process.cwd(), 'templates', 'email');
    }

    /**
     * Initializes the email service with the provided configuration.
     * Sets up the SMTP transporter and validates the connection.
     * @param {Object} config - Email configuration options
     */
    async initialize(config = {}) {
        // Create email transport with fallback to development settings
        this.transporter = nodemailer.createTransport({
            host: config.host || process.env.MAIL_HOST || 'localhost',
            port: config.port || process.env.MAIL_PORT || 25,
            secure: config.secure || process.env.MAIL_SECURE === 'true',
            auth: config.auth ? {
                user: config.auth.user || process.env.MAIL_USER,
                pass: config.auth.pass || process.env.MAIL_PASSWORD
            } : undefined,
            tls: {
                rejectUnauthorized: config.verifySSL || process.env.MAIL_VERIFY_SSL !== 'false'
            }
        });

        // Verify connection configuration
        try {
            await this.transporter.verify();
            console.log('Email service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize email service:', error);
            throw error;
        }
    }

    /**
     * Loads and caches an email template.
     * Templates are loaded from the filesystem and compiled with Handlebars.
     * @param {string} templateName - Name of the template to load
     * @returns {Promise<Function>} Compiled template function
     */
    async loadTemplate(templateName) {
        // Check template cache first
        if (this.templateCache.has(templateName)) {
            return this.templateCache.get(templateName);
        }

        try {
            // Load template file
            const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);
            const templateContent = await fs.readFile(templatePath, 'utf8');

            // Compile template and cache it
            const template = Handlebars.compile(templateContent);
            this.templateCache.set(templateName, template);
            return template;
        } catch (error) {
            throw new Error(`Failed to load email template '${templateName}': ${error.message}`);
        }
    }

    /**
     * Sends an email using the configured transport.
     * Supports both plain text and HTML content with templates.
     * @param {Object} options - Email sending options
     * @returns {Promise<Object>} Send result
     */
    async sendEmail({
        to,
        subject,
        template,
        data = {},
        from = this.defaultFrom,
        attachments = [],
        priority = 'normal'
    }) {
        if (!this.transporter) {
            throw new Error('Email service not initialized');
        }

        try {
            // Load and render template if specified
            let html;
            let text;
            if (template) {
                const compiledTemplate = await this.loadTemplate(template);
                html = compiledTemplate(data);
                // Generate plain text version from HTML
                text = this.htmlToText(html);
            }

            // Prepare email data
            const mailOptions = {
                from,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                text: text || data.text,
                html: html || data.html,
                attachments,
                priority,
                headers: {
                    'X-CloudPanel-Notification': 'true'
                }
            };

            // Log email attempt (masking sensitive data)
            const logData = maskSensitiveData(mailOptions, ['to', 'from']);
            console.log('Sending email:', logData);

            // Send email
            const result = await this.transporter.sendMail(mailOptions);
            console.log('Email sent successfully:', result.messageId);
            return result;
        } catch (error) {
            console.error('Failed to send email:', error);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    /**
     * Sends a test email to verify configuration.
     * @param {string} to - Recipient email address
     * @returns {Promise<Object>} Test result
     */
    async sendTestEmail(to) {
        return this.sendEmail({
            to,
            subject: 'CloudPanel Email Test',
            template: 'test',
            data: {
                timestamp: new Date().toISOString(),
                recipient: to
            }
        });
    }

    /**
     * Converts HTML content to plain text.
     * Simple conversion for fallback plain text content.
     * @param {string} html - HTML content to convert
     * @returns {string} Plain text content
     */
    htmlToText(html) {
        return html
            .replace(/<style[^>]*>.*<\/style>/gi, '')
            .replace(/<script[^>]*>.*<\/script>/gi, '')
            .replace(/<[^>]+>/gi, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/[\r\n\s\t]+/g, ' ')
            .trim();
    }

    /**
     * Validates an email address format.
     * @param {string} email - Email address to validate
     * @returns {boolean} Whether email is valid
     */
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Cleans up resources used by the email service.
     * Closes SMTP connection and clears caches.
     */
    async cleanup() {
        if (this.transporter) {
            this.transporter.close();
            this.transporter = null;
        }
        this.templateCache.clear();
    }

    /**
     * Registers a custom Handlebars helper for email templates.
     * @param {string} name - Helper name
     * @param {Function} helper - Helper function
     */
    registerTemplateHelper(name, helper) {
        Handlebars.registerHelper(name, helper);
    }
}

// Create and export a singleton instance
const emailService = new EmailService();

// Register default template helpers
emailService.registerTemplateHelper('formatDate', (date) => {
    return new Date(date).toLocaleString();
});

emailService.registerTemplateHelper('uppercase', (str) => {
    return str.toUpperCase();
});

/**
 * Simplified email sending function for direct use.
 * @param {Object} options - Email options
 * @returns {Promise<Object>} Send result
 */
export async function sendEmail(options) {
    return emailService.sendEmail(options);
}

/**
 * Send a password reset email.
 * @param {string} to - Recipient email
 * @param {string} token - Reset token
 * @param {string} username - User's name
 * @returns {Promise<Object>} Send result
 */
export async function sendPasswordResetEmail(to, token, username) {
    return emailService.sendEmail({
        to,
        subject: 'Password Reset Request',
        template: 'password-reset',
        data: {
            username,
            resetLink: `${process.env.APP_URL}/reset-password?token=${token}`,
            expiresIn: '1 hour'
        },
        priority: 'high'
    });
}

/**
 * Send a welcome email to new users.
 * @param {string} to - Recipient email
 * @param {string} username - User's name
 * @returns {Promise<Object>} Send result
 */
export async function sendWelcomeEmail(to, username) {
    return emailService.sendEmail({
        to,
        subject: 'Welcome to CloudPanel',
        template: 'welcome',
        data: {
            username,
            loginLink: process.env.APP_URL,
            supportEmail: process.env.SUPPORT_EMAIL
        }
    });
}

/**
 * Send a notification about certificate expiration.
 * @param {Object} certInfo - Certificate information
 * @param {string} to - Recipient email
 * @returns {Promise<Object>} Send result
 */
export async function sendCertificateExpiryNotification(certInfo, to) {
    return emailService.sendEmail({
        to,
        subject: `SSL Certificate Expiring Soon - ${certInfo.domain}`,
        template: 'cert-expiry',
        data: {
            domain: certInfo.domain,
            expiryDate: certInfo.expiryDate,
            daysRemaining: certInfo.daysRemaining
        },
        priority: 'high'
    });
}

// Export the service instance for direct access if needed
export default emailService;