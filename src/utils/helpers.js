// src/utils/helpers.js
import crypto from 'crypto';
import { promisify } from 'util';

/**
 * Generates a secure random string suitable for tokens or identifiers.
 * Uses cryptographically secure random number generation.
 * @param {number} length - Desired length of the string
 * @param {string} [charset] - Characters to use in generation
 * @returns {string} Generated random string
 */
export function generateSecureString(length = 32, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    // Generate secure random bytes
    const bytes = crypto.randomBytes(length);
    const result = new Array(length);
    
    // Map random bytes to charset indices
    for (let i = 0; i < length; i++) {
        result[i] = charset[bytes[i] % charset.length];
    }
    
    return result.join('');
}

/**
 * Deep clones an object while handling cyclic references.
 * Useful for safely copying complex configuration objects.
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export function deepClone(obj) {
    // Handle non-object types and null
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // Handle Date objects
    if (obj instanceof Date) {
        return new Date(obj);
    }

    // Handle Array objects
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item));
    }

    // Handle regular objects
    const cloned = {};
    const seenRefs = new WeakMap();

    function cloneRecursive(obj) {
        if (seenRefs.has(obj)) {
            return seenRefs.get(obj);
        }

        const clone = {};
        seenRefs.set(obj, clone);

        Object.entries(obj).forEach(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
                clone[key] = cloneRecursive(value);
            } else {
                clone[key] = value;
            }
        });

        return clone;
    }

    return cloneRecursive(obj);
}

/**
 * Creates a debounced version of a function.
 * Useful for rate-limiting API calls and event handlers.
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Merges multiple objects deeply, prioritizing later sources.
 * Useful for combining configuration objects.
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
export function deepMerge(...objects) {
    const isObject = obj => obj && typeof obj === 'object' && !Array.isArray(obj);

    return objects.reduce((result, current) => {
        if (!current) return result;

        Object.keys(current).forEach(key => {
            const resultValue = result[key];
            const currentValue = current[key];

            if (isObject(resultValue) && isObject(currentValue)) {
                result[key] = deepMerge(resultValue, currentValue);
            } else {
                result[key] = currentValue;
            }
        });

        return result;
    }, {});
}

/**
 * Converts snake_case strings to camelCase.
 * Useful for converting between database and JavaScript conventions.
 * @param {string} str - Snake case string
 * @returns {string} Camel case string
 */
export function snakeToCamel(str) {
    return str.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Converts camelCase strings to snake_case.
 * Useful for converting between JavaScript and database conventions.
 * @param {string} str - Camel case string
 * @returns {string} Snake case string
 */
export function camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Masks sensitive information in a string or object.
 * Useful for logging sensitive data safely.
 * @param {string|Object} data - Data to mask
 * @param {Array<string>} [fieldsToMask=['password', 'token', 'key']] - Fields to mask
 * @returns {string|Object} Masked data
 */
export function maskSensitiveData(data, fieldsToMask = ['password', 'token', 'key']) {
    if (typeof data === 'string') {
        return '*'.repeat(Math.min(data.length, 8));
    }

    if (typeof data !== 'object' || data === null) {
        return data;
    }

    const masked = { ...data };
    for (const field of fieldsToMask) {
        if (field in masked) {
            masked[field] = '*'.repeat(8);
        }
    }

    return masked;
}

/**
 * Checks if two values are deep equal.
 * Handles objects, arrays, and primitive types.
 * @param {*} value1 - First value
 * @param {*} value2 - Second value
 * @returns {boolean} Whether values are equal
 */
export function isDeepEqual(value1, value2) {
    // Handle primitive types and referential equality
    if (value1 === value2) {
        return true;
    }

    // Handle null/undefined cases
    if (value1 == null || value2 == null) {
        return value1 === value2;
    }

    // Handle different types
    if (typeof value1 !== typeof value2) {
        return false;
    }

    // Handle Date objects
    if (value1 instanceof Date && value2 instanceof Date) {
        return value1.getTime() === value2.getTime();
    }

    // Handle arrays
    if (Array.isArray(value1) && Array.isArray(value2)) {
        if (value1.length !== value2.length) {
            return false;
        }
        return value1.every((val, index) => isDeepEqual(val, value2[index]));
    }

    // Handle objects
    if (typeof value1 === 'object') {
        const keys1 = Object.keys(value1);
        const keys2 = Object.keys(value2);

        if (keys1.length !== keys2.length) {
            return false;
        }

        return keys1.every(key => 
            Object.prototype.hasOwnProperty.call(value2, key) &&
            isDeepEqual(value1[key], value2[key])
        );
    }

    return false;
}

/**
 * Retries an async function with exponential backoff.
 * Useful for handling transient failures in network requests.
 * @param {Function} func - Async function to retry
 * @param {Object} [options] - Retry options
 * @returns {Promise} Function result
 */
export async function retryWithBackoff(
    func,
    { 
        maxAttempts = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        factor = 2,
        onRetry = null
    } = {}
) {
    let attempt = 1;
    let delay = initialDelay;

    while (attempt <= maxAttempts) {
        try {
            return await func();
        } catch (error) {
            if (attempt === maxAttempts) {
                throw error;
            }

            if (onRetry) {
                onRetry(error, attempt);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * factor, maxDelay);
            attempt++;
        }
    }
}

/**
 * Creates a normalized version of a string for consistent comparison.
 * Handles different character encodings and normalizations.
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
export function normalizeString(str) {
    return str
        .normalize('NFKC')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Generates a hash of any serializable data.
 * Useful for caching and comparison purposes.
 * @param {*} data - Data to hash
 * @returns {string} Hash string
 */
export function generateHash(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto
        .createHash('sha256')
        .update(str)
        .digest('hex');
}

/**
 * Parses and validates a JSON string safely.
 * Handles common JSON parsing errors gracefully.
 * @param {string} str - JSON string to parse
 * @param {*} [defaultValue=null] - Default value if parsing fails
 * @returns {*} Parsed object or default value
 */
export function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (error) {
        return defaultValue;
    }
}

/**
 * Formats a date into an ISO string with timezone.
 * Ensures consistent date formatting across the application.
 * @param {Date|string|number} date - Date to format
 * @param {string} [timezone='UTC'] - Timezone to use
 * @returns {string} Formatted date string
 */
export function formatDate(date, timezone = 'UTC') {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
        throw new Error('Invalid date');
    }
    
    return d.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}