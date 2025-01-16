// src/utils/numbers.js

/**
 * Rounds a number to a specified number of decimal places.
 * Uses Math.round() to avoid floating point precision issues.
 * @param {number} value - Number to round
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {number} Rounded number
 */
export function roundToDecimal(value, decimals = 2) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 0;
    }
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
}

/**
 * Formats a number as a percentage with optional decimal places.
 * @param {number} value - Number to format (0-100)
 * @param {number} [decimals=1] - Number of decimal places
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value, decimals = 1) {
    const rounded = roundToDecimal(value, decimals);
    return `${rounded}%`;
}

/**
 * Formats a file size in bytes to a human-readable string.
 * Automatically selects the appropriate unit (B, KB, MB, GB, TB).
 * @param {number} bytes - Size in bytes
 * @param {boolean} [binary=true] - Use binary (1024) or decimal (1000) units
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes, binary = true) {
    if (typeof bytes !== 'number' || bytes < 0) {
        return '0 B';
    }

    const units = binary 
        ? ['B', 'KiB', 'MiB', 'GiB', 'TiB']
        : ['B', 'KB', 'MB', 'GB', 'TB'];
    const base = binary ? 1024 : 1000;

    if (bytes === 0) {
        return '0 B';
    }

    const exponent = Math.floor(Math.log(bytes) / Math.log(base));
    const unit = units[Math.min(exponent, units.length - 1)];
    const size = bytes / Math.pow(base, exponent);

    return `${roundToDecimal(size, 2)} ${unit}`;
}

/**
 * Safely calculates a percentage, handling division by zero.
 * @param {number} part - Numerator
 * @param {number} total - Denominator
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {number} Calculated percentage
 */
export function calculatePercentage(part, total, decimals = 2) {
    if (!total || typeof part !== 'number' || typeof total !== 'number') {
        return 0;
    }
    return roundToDecimal((part / total) * 100, decimals);
}

/**
 * Ensures a number is within specified bounds.
 * @param {number} value - Number to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Formats a number with thousand separators.
 * @param {number} value - Number to format
 * @param {string} [locale='en-US'] - Locale for formatting
 * @returns {string} Formatted number string
 */
export function formatNumber(value, locale = 'en-US') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '0';
    }
    return value.toLocaleString(locale);
}

/**
 * Calculates the average of an array of numbers.
 * @param {number[]} values - Array of numbers
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {number} Calculated average
 */
export function calculateAverage(values, decimals = 2) {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }
    const sum = values.reduce((acc, val) => acc + (Number(val) || 0), 0);
    return roundToDecimal(sum / values.length, decimals);
}

/**
 * Calculates sum while handling potential floating point issues.
 * @param {number[]} values - Array of numbers to sum
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {number} Calculated sum
 */
export function calculateSum(values, decimals = 2) {
    if (!Array.isArray(values)) {
        return 0;
    }
    const sum = values.reduce((acc, val) => acc + (Number(val) || 0), 0);
    return roundToDecimal(sum, decimals);
}

/**
 * Converts a string representation of memory (e.g., '256M', '1G') to bytes.
 * @param {string} memoryString - Memory string to convert
 * @returns {number} Size in bytes
 */
export function parseMemoryString(memoryString) {
    if (typeof memoryString !== 'string') {
        return 0;
    }

    const matches = memoryString.match(/^(\d+)([KMGT]?)$/i);
    if (!matches) {
        return 0;
    }

    const value = parseInt(matches[1], 10);
    const unit = matches[2].toUpperCase();
    const multipliers = {
        '': 1,
        'K': 1024,
        'M': 1024 * 1024,
        'G': 1024 * 1024 * 1024,
        'T': 1024 * 1024 * 1024 * 1024
    };

    return value * (multipliers[unit] || 1);
}

/**
 * Formats a memory size in bytes to a rounded string with units.
 * @param {number} bytes - Memory size in bytes
 * @returns {string} Formatted memory string
 */
export function formatMemoryString(bytes) {
    if (typeof bytes !== 'number' || bytes < 0) {
        return '0';
    }

    const units = ['', 'K', 'M', 'G', 'T'];
    const base = 1024;

    if (bytes === 0) {
        return '0';
    }

    const exponent = Math.floor(Math.log(bytes) / Math.log(base));
    const unit = units[Math.min(exponent, units.length - 1)];
    const size = bytes / Math.pow(base, exponent);

    return `${Math.round(size)}${unit}`;
}