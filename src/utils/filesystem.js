// src/utils/filesystem.js
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Creates a directory and all necessary parent directories.
 * Ensures proper error handling and atomic operations.
 * @param {string} dirPath - Full path of directory to create
 * @returns {Promise<void>}
 */
export async function createDirectory(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true, mode: 0o755 });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
        }
    }
}

/**
 * Sets appropriate permissions for a path based on user and group.
 * Ensures secure file ownership and access rights.
 * @param {string} targetPath - Path to set permissions on
 * @param {string} username - System username to own the path
 * @param {string} [group='www-data'] - System group to own the path
 * @returns {Promise<void>}
 */
export async function setPermissions(targetPath, username, group = 'www-data') {
    try {
        await execAsync(`chown -R ${username}:${group} "${targetPath}"`);
        await execAsync(`chmod -R u=rwX,g=rX,o= "${targetPath}"`);
    } catch (error) {
        throw new Error(`Failed to set permissions on ${targetPath}: ${error.message}`);
    }
}

/**
 * Safely removes a directory and its contents.
 * Includes safeguards against deleting critical system paths.
 * @param {string} dirPath - Path to directory to remove
 * @returns {Promise<void>}
 */
export async function removeDirectory(dirPath) {
    // Protect against deleting critical system paths
    const protectedPaths = ['/', '/home', '/etc', '/var'];
    if (protectedPaths.includes(dirPath)) {
        throw new Error('Cannot delete protected system path');
    }

    try {
        await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
        throw new Error(`Failed to remove directory ${dirPath}: ${error.message}`);
    }
}

/**
 * Creates a temporary directory with unique name.
 * Useful for processing uploads and temporary file operations.
 * @param {string} [prefix='tmp'] - Prefix for temporary directory name
 * @returns {Promise<string>} Path to created temporary directory
 */
export async function createTempDirectory(prefix = 'tmp') {
    try {
        const tempPath = await fs.mkdtemp(path.join('/tmp', `${prefix}-`));
        return tempPath;
    } catch (error) {
        throw new Error(`Failed to create temporary directory: ${error.message}`);
    }
}

/**
 * Checks if a path exists and has required permissions.
 * Verifies read/write access based on provided mode.
 * @param {string} targetPath - Path to check
 * @param {number} mode - Permission mode to check (fs.constants.R_OK | fs.constants.W_OK)
 * @returns {Promise<boolean>} Whether path exists and has permissions
 */
export async function checkPathPermissions(targetPath, mode) {
    try {
        await fs.access(targetPath, mode);
        return true;
    } catch {
        return false;
    }
}

/**
 * Calculates the size of a directory recursively.
 * @param {string} dirPath - Path to directory
 * @returns {Promise<number>} Size in bytes
 */
export async function getDirectorySize(dirPath) {
    try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        const sizes = await Promise.all(files.map(async file => {
            const filePath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                return getDirectorySize(filePath);
            }
            const stats = await fs.stat(filePath);
            return stats.size;
        }));
        return sizes.reduce((acc, size) => acc + size, 0);
    } catch (error) {
        throw new Error(`Failed to calculate directory size for ${dirPath}: ${error.message}`);
    }
}

/**
 * Copies a file or directory recursively.
 * Preserves file permissions and timestamps.
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @param {Object} [options] - Copy options
 * @param {boolean} [options.overwrite=false] - Whether to overwrite existing files
 * @returns {Promise<void>}
 */
export async function copyPath(src, dest, options = { overwrite: false }) {
    try {
        const stats = await fs.stat(src);
        
        if (stats.isDirectory()) {
            await createDirectory(dest);
            const files = await fs.readdir(src);
            await Promise.all(files.map(file => 
                copyPath(
                    path.join(src, file),
                    path.join(dest, file),
                    options
                )
            ));
        } else {
            if (!options.overwrite && await checkPathPermissions(dest, fs.constants.F_OK)) {
                throw new Error('Destination already exists');
            }
            await fs.copyFile(src, dest, fs.constants.COPYFILE_FICLONE);
            await fs.utimes(dest, stats.atime, stats.mtime);
            await fs.chmod(dest, stats.mode);
        }
    } catch (error) {
        throw new Error(`Failed to copy ${src} to ${dest}: ${error.message}`);
    }
}

/**
 * Creates a symbolic link with proper error handling.
 * @param {string} target - Target path
 * @param {string} path - Path for new symlink
 * @returns {Promise<void>}
 */
export async function createSymlink(target, path) {
    try {
        await fs.symlink(target, path);
    } catch (error) {
        throw new Error(`Failed to create symlink from ${target} to ${path}: ${error.message}`);
    }
}

/**
 * Reads and parses a JSON file with proper error handling.
 * @param {string} filePath - Path to JSON file
 * @returns {Promise<Object>} Parsed JSON data
 */
export async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        throw new Error(`Failed to read JSON file ${filePath}: ${error.message}`);
    }
}

/**
 * Writes data to a JSON file with proper formatting.
 * @param {string} filePath - Path to JSON file
 * @param {Object} data - Data to write
 * @returns {Promise<void>}
 */
export async function writeJsonFile(filePath, data) {
    try {
        await fs.writeFile(
            filePath,
            JSON.stringify(data, null, 2),
            { mode: 0o600 }
        );
    } catch (error) {
        throw new Error(`Failed to write JSON file ${filePath}: ${error.message}`);
    }
}