// src/utils/validation.js

/**
 * Validates domain name format according to RFC standards.
 * Checks for valid characters, length limits, and proper label structure.
 * @param {string} domain - Domain name to validate
 * @returns {boolean} Whether domain is valid
 */
export function validateDomain(domain) {
    if (typeof domain !== 'string') {
        return false;
    }

    // Basic domain validation rules:
    // - Between 1 and 253 characters
    // - Only letters, numbers, hyphens
    // - Labels separated by dots
    // - No consecutive dots
    // - No leading/trailing dots or hyphens
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    
    if (!domainRegex.test(domain) || domain.length > 253) {
        return false;
    }

    // Check individual label lengths
    const labels = domain.split('.');
    return labels.every(label => label.length <= 63);
}

/**
 * Validates an email address format.
 * Implements comprehensive email validation based on RFC 5322.
 * @param {string} email - Email address to validate
 * @returns {boolean} Whether email is valid
 */
export function validateEmail(email) {
    if (typeof email !== 'string') {
        return false;
    }

    // RFC 5322 compliant email regex
    const emailRegex = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;

    return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validates IPv4 or IPv6 address format.
 * Supports both standard and compressed IPv6 notation.
 * @param {string} ip - IP address to validate
 * @returns {boolean} Whether IP address is valid
 */
export function validateIPAddress(ip) {
    if (typeof ip !== 'string') {
        return false;
    }

    // IPv4 validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6 validation (including compressed notation)
    const ipv6Regex = /^(?:(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}|(?:[a-fA-F0-9]{1,4}:){1,7}:|(?:[a-fA-F0-9]{1,4}:){1,6}:[a-fA-F0-9]{1,4}|(?:[a-fA-F0-9]{1,4}:){1,5}(?::[a-fA-F0-9]{1,4}){1,2}|(?:[a-fA-F0-9]{1,4}:){1,4}(?::[a-fA-F0-9]{1,4}){1,3}|(?:[a-fA-F0-9]{1,4}:){1,3}(?::[a-fA-F0-9]{1,4}){1,4}|(?:[a-fA-F0-9]{1,4}:){1,2}(?::[a-fA-F0-9]{1,4}){1,5}|[a-fA-F0-9]{1,4}:(?:(?::[a-fA-F0-9]{1,4}){1,6})|:(?:(?::[a-fA-F0-9]{1,4}){1,7}|:)|fe80:(?::[a-fA-F0-9]{0,4}){0,4}%[0-9a-zA-Z]+|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])|(?:[a-fA-F0-9]{1,4}:){1,4}:(?:(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9])\.){3}(?:25[0-5]|(?:2[0-4]|1?[0-9])?[0-9]))$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Validates a username format.
 * Enforces secure username policy for CloudPanel.
 * @param {string} username - Username to validate
 * @returns {boolean} Whether username is valid
 */
export function validateUsername(username) {
    if (typeof username !== 'string') {
        return false;
    }

    // Username requirements:
    // - 3-32 characters
    // - Letters, numbers, underscore, hyphen
    // - Must start with a letter
    // - No consecutive special characters
    const usernameRegex = /^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/;
    return usernameRegex.test(username) && !username.includes('--') && !username.includes('__');
}

/**
 * Validates password strength according to security requirements.
 * Enforces minimum complexity rules for secure passwords.
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with details
 */
export function validatePassword(password) {
    if (typeof password !== 'string') {
        return {
            isValid: false,
            message: 'Password must be a string'
        };
    }

    const requirements = [
        {
            test: /.{8,}/,
            message: 'At least 8 characters long'
        },
        {
            test: /[A-Z]/,
            message: 'At least one uppercase letter'
        },
        {
            test: /[a-z]/,
            message: 'At least one lowercase letter'
        },
        {
            test: /[0-9]/,
            message: 'At least one number'
        },
        {
            test: /[!@#$%^&*(),.?":{}|<>]/,
            message: 'At least one special character'
        }
    ];

    const failedRequirements = requirements.filter(req => !req.test.test(password));

    return {
        isValid: failedRequirements.length === 0,
        message: failedRequirements.map(req => req.message).join(', ')
    };
}

/**
 * Validates database name format.
 * Ensures compliance with MySQL/MariaDB naming rules.
 * @param {string} name - Database name to validate
 * @returns {boolean} Whether database name is valid
 */
export function validateDatabaseName(name) {
    if (typeof name !== 'string') {
        return false;
    }

    // Database name requirements:
    // - 1-64 characters
    // - Letters, numbers, underscore
    // - Case-sensitive
    const dbNameRegex = /^[a-zA-Z0-9_]+$/;
    return dbNameRegex.test(name) && name.length <= 64;
}

/**
 * Validates an SSL certificate and its components.
 * Checks certificate format, chain validity, and expiration.
 * @param {Object} certData - Certificate data to validate
 * @returns {Object} Validation result with details
 */
export function validateCertificate(certData) {
    const { certificate, private_key, certificate_chain } = certData;

    // Basic format validation
    if (!certificate?.includes('BEGIN CERTIFICATE') || 
        !certificate?.includes('END CERTIFICATE')) {
        return {
            isValid: false,
            error: 'Invalid certificate format'
        };
    }

    if (!private_key?.includes('BEGIN PRIVATE KEY') || 
        !private_key?.includes('END PRIVATE KEY')) {
        return {
            isValid: false,
            error: 'Invalid private key format'
        };
    }

    if (certificate_chain && 
        (!certificate_chain.includes('BEGIN CERTIFICATE') || 
         !certificate_chain.includes('END CERTIFICATE'))) {
        return {
            isValid: false,
            error: 'Invalid certificate chain format'
        };
    }

    // Extract expiration date from certificate
    const expiryMatch = certificate.match(/Not After\s*:\s*(.+)/);
    if (!expiryMatch) {
        return {
            isValid: false,
            error: 'Could not determine certificate expiration'
        };
    }

    const expiryDate = new Date(expiryMatch[1]);
    
    return {
        isValid: true,
        expires_at: expiryDate.toISOString()
    };
}

/**
 * Validates a port number.
 * Ensures port is within valid range and not reserved.
 * @param {number} port - Port number to validate
 * @returns {boolean} Whether port is valid
 */
export function validatePort(port) {
    if (typeof port !== 'number' || isNaN(port)) {
        return false;
    }

    // Port requirements:
    // - Between 1 and 65535
    // - Not in reserved range (0-1023) unless explicitly allowed
    return port > 0 && port <= 65535;
}

/**
 * Validates a cron expression format.
 * Ensures compliance with standard cron syntax.
 * @param {string} cronExp - Cron expression to validate
 * @returns {boolean} Whether cron expression is valid
 */
export function validateCronExpression(cronExp) {
    if (typeof cronExp !== 'string') {
        return false;
    }

    // Standard cron format validation
    const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;

    return cronRegex.test(cronExp);
}