// src/controllers/backupController.js
import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Controller for managing system and site backups in CloudPanel
 * Handles both database and file backups with proper retention policies
 * Integrates with CloudPanel's existing backup structure:
 * - System backups: /home/clp/backups/
 * - Site backups: /home/[username]/backups/
 */
export const backupController = {
    /**
     * Create a complete backup of a site
     * Includes files, databases, and configuration
     */
    async createSiteBackup(req, res) {
        try {
            const { site_id } = req.params;
            
            // Get site details
            const site = await db.get(`
                SELECT s.*, d.name as db_name, d.id as db_id
                FROM site s
                LEFT JOIN database d ON d.site_id = s.id
                WHERE s.id = ?
            `, [site_id]);

            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found'
                });
            }

            // Create timestamp for backup
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join('/home', site.user, 'backups', timestamp);

            // Ensure backup directory exists
            await fs.mkdir(backupDir, { recursive: true });

            try {
                // Start backup process
                await db.run('BEGIN TRANSACTION');

                // 1. Backup site files
                const filesBackupPath = path.join(backupDir, 'files');
                await execAsync(`tar -czf "${filesBackupPath}.tar.gz" -C /home/${site.user}/htdocs .`);

                // 2. Backup database if exists
                if (site.db_id) {
                    const dbBackupPath = path.join(backupDir, `${site.db_name}.sql`);
                    
                    // Get database credentials
                    const dbServer = await db.get(`
                        SELECT ds.* 
                        FROM database_server ds
                        JOIN database d ON d.database_server_id = ds.id
                        WHERE d.id = ?
                    `, [site.db_id]);

                    // Create database dump
                    await execAsync(`mysqldump --host=${dbServer.host} \
                        --user=${dbServer.user_name} \
                        --password=${dbServer.password} \
                        ${site.db_name} > "${dbBackupPath}"`);

                    // Compress database dump
                    await execAsync(`gzip "${dbBackupPath}"`);
                }

                // 3. Backup site configuration
                const configBackupPath = path.join(backupDir, 'config');
                await fs.writeFile(configBackupPath + '.json', JSON.stringify({
                    site_config: {
                        domain: site.domain_name,
                        type: site.type,
                        php_settings: await this.getPhpSettings(site.php_settings_id),
                        varnish_cache: site.varnish_cache,
                        page_speed_enabled: site.page_speed_enabled
                    },
                    timestamp: new Date().toISOString(),
                    version: await this.getCloudPanelVersion()
                }, null, 2));

                // Record backup in database
                await db.run(`
                    INSERT INTO backup_log (
                        site_id, path, type, created_at, size
                    ) VALUES (?, ?, ?, datetime('now'), ?)
                `, [
                    site_id,
                    backupDir,
                    'full',
                    await this.getDirectorySize(backupDir)
                ]);

                await db.run('COMMIT');

                // Apply retention policy
                await this.enforceRetentionPolicy(site.user);

                res.json({
                    success: true,
                    data: {
                        backup_path: backupDir,
                        timestamp,
                        includes_database: !!site.db_id
                    }
                });
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            req.logger.error('Error creating site backup:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create site backup'
            });
        }
    },

    /**
     * Restore a site from a specific backup
     * Handles both files and database restoration
     */
    async restoreSiteBackup(req, res) {
        try {
            const { site_id, backup_timestamp } = req.params;
            
            // Get site details
            const site = await db.get('SELECT * FROM site WHERE id = ?', [site_id]);
            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found'
                });
            }

            const backupDir = path.join('/home', site.user, 'backups', backup_timestamp);
            
            // Verify backup exists
            try {
                await fs.access(backupDir);
            } catch {
                return res.status(404).json({
                    success: false,
                    error: 'Backup not found'
                });
            }

            try {
                await db.run('BEGIN TRANSACTION');

                // 1. Restore files
                const filesBackup = path.join(backupDir, 'files.tar.gz');
                if (await fs.access(filesBackup).then(() => true).catch(() => false)) {
                    // Create temporary restoration directory
                    const tempDir = await fs.mkdtemp(path.join('/tmp', 'restore-'));
                    
                    // Extract files to temp directory first
                    await execAsync(`tar -xzf "${filesBackup}" -C "${tempDir}"`);
                    
                    // Move files to actual location
                    await execAsync(`rsync -a --delete "${tempDir}/" "/home/${site.user}/htdocs/"`);
                    
                    // Cleanup
                    await fs.rm(tempDir, { recursive: true });
                }

                // 2. Restore database if exists
                const dbBackups = await fs.readdir(backupDir);
                const dbBackup = dbBackups.find(f => f.endsWith('.sql.gz'));
                
                if (dbBackup) {
                    // Get database credentials
                    const dbServer = await db.get(`
                        SELECT ds.* 
                        FROM database_server ds
                        JOIN database d ON d.database_server_id = ds.id
                        WHERE d.site_id = ?
                    `, [site_id]);

                    // Extract and restore database
                    const dbFile = path.join(backupDir, dbBackup);
                    await execAsync(`gunzip -c "${dbFile}" | mysql \
                        --host=${dbServer.host} \
                        --user=${dbServer.user_name} \
                        --password=${dbServer.password} \
                        ${dbBackup.replace('.sql.gz', '')}`);
                }

                // 3. Restore configuration
                const configFile = path.join(backupDir, 'config.json');
                if (await fs.access(configFile).then(() => true).catch(() => false)) {
                    const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
                    
                    // Update site configuration
                    await db.run(`
                        UPDATE site
                        SET 
                            varnish_cache = ?,
                            page_speed_enabled = ?,
                            updated_at = datetime('now')
                        WHERE id = ?
                    `, [
                        config.site_config.varnish_cache,
                        config.site_config.page_speed_enabled,
                        site_id
                    ]);

                    // Update PHP settings if they exist
                    if (config.site_config.php_settings) {
                        await this.updatePhpSettings(
                            site.php_settings_id,
                            config.site_config.php_settings
                        );
                    }
                }

                await db.run('COMMIT');

                res.json({
                    success: true,
                    message: 'Site restored successfully',
                    timestamp: backup_timestamp
                });
            } catch (error) {
                await db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            req.logger.error('Error restoring site backup:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to restore site backup'
            });
        }
    },

    /**
     * List available backups for a site
     * Provides backup details including size and timestamp
     */
    async listSiteBackups(req, res) {
        try {
            const { site_id } = req.params;

            const site = await db.get('SELECT user FROM site WHERE id = ?', [site_id]);
            if (!site) {
                return res.status(404).json({
                    success: false,
                    error: 'Site not found'
                });
            }

            const backupDir = path.join('/home', site.user, 'backups');
            const backups = await db.all(`
                SELECT path, type, created_at, size
                FROM backup_log
                WHERE site_id = ?
                ORDER BY created_at DESC
            `, [site_id]);

            res.json({
                success: true,
                data: backups
            });
        } catch (error) {
            req.logger.error('Error listing backups:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list backups'
            });
        }
    },

    /**
     * Helper method to get PHP settings
     * Returns current PHP configuration for a site
     */
    async getPhpSettings(settingsId) {
        return db.get('SELECT * FROM php_settings WHERE id = ?', [settingsId]);
    },

    /**
     * Helper method to update PHP settings
     * Updates PHP configuration for a site
     */
    async updatePhpSettings(settingsId, settings) {
        return db.run(`
            UPDATE php_settings
            SET 
                memory_limit = ?,
                max_execution_time = ?,
                max_input_vars = ?,
                post_max_size = ?,
                upload_max_file_size = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `, [
            settings.memory_limit,
            settings.max_execution_time,
            settings.max_input_vars,
            settings.post_max_size,
            settings.upload_max_file_size,
            settingsId
        ]);
    },

    /**
     * Helper method to get CloudPanel version
     * Used for backup metadata
     */
    async getCloudPanelVersion() {
        const result = await db.get(
            "SELECT value FROM config WHERE key = 'app_version'"
        );
        return result ? result.value : 'unknown';
    },

    /**
     * Helper method to get directory size
     * Calculates total size of backup
     */
    async getDirectorySize(directory) {
        const { stdout } = await execAsync(`du -sb "${directory}"`);
        return parseInt(stdout.split('\t')[0]);
    },

    /**
     * Helper method to enforce backup retention policy
     * Removes old backups based on configured policy
     */
    async enforceRetentionPolicy(username) {
        const backupDir = path.join('/home', username, 'backups');
        const RETENTION_DAYS = 30; // Configure as needed

        const backups = await fs.readdir(backupDir);
        const now = new Date();

        for (const backup of backups) {
            const backupPath = path.join(backupDir, backup);
            const stats = await fs.stat(backupPath);
            const ageInDays = (now - stats.mtime) / (1000 * 60 * 60 * 24);

            if (ageInDays > RETENTION_DAYS) {
                await fs.rm(backupPath, { recursive: true });
                await db.run(
                    'DELETE FROM backup_log WHERE path = ?',
                    [backupPath]
                );
            }
        }
    }
};