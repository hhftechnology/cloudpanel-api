// src/metrics/collectors.js
import os from 'os';
import { db } from '../config/database.js';
import prometheusMetrics from './prometheus.js';
import { formatFileSize } from '../utils/numbers.js';

/**
 * Metric Collectors for CloudPanel
 * Implements collectors for gathering various system and application metrics.
 * Runs periodic collection of metrics for monitoring and alerting.
 */
class MetricCollectors {
    constructor() {
        this.collectors = {
            system: this.collectSystemMetrics.bind(this),
            database: this.collectDatabaseMetrics.bind(this),
            certificates: this.collectCertificateMetrics.bind(this),
            sites: this.collectSiteMetrics.bind(this),
            users: this.collectUserMetrics.bind(this)
        };
        
        this.intervals = {};
    }

    /**
     * Starts all metric collectors with configured intervals
     */
    startCollectors() {
        const baseInterval = 60000; // 1 minute

        // System metrics (every minute)
        this.intervals.system = setInterval(
            this.collectors.system,
            baseInterval
        );

        // Database metrics (every 5 minutes)
        this.intervals.database = setInterval(
            this.collectors.database,
            baseInterval * 5
        );

        // Certificate metrics (every hour)
        this.intervals.certificates = setInterval(
            this.collectors.certificates,
            baseInterval * 60
        );

        // Site metrics (every 5 minutes)
        this.intervals.sites = setInterval(
            this.collectors.sites,
            baseInterval * 5
        );

        // User metrics (every 5 minutes)
        this.intervals.users = setInterval(
            this.collectors.users,
            baseInterval * 5
        );

        console.log('Metric collectors started');
    }

    /**
     * Stops all metric collectors
     */
    stopCollectors() {
        Object.values(this.intervals).forEach(interval => {
            clearInterval(interval);
        });
        this.intervals = {};
        console.log('Metric collectors stopped');
    }

    /**
     * Collects system resource metrics
     */
    async collectSystemMetrics() {
        try {
            // CPU Usage
            const cpuUsage = os.loadavg()[0] / os.cpus().length;
            prometheusMetrics.metrics.resourceUsage
                .labels('cpu')
                .set(cpuUsage);

            // Memory Usage
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const memUsage = (totalMem - freeMem) / totalMem;
            prometheusMetrics.metrics.resourceUsage
                .labels('memory')
                .set(memUsage);

            // Disk Usage
            const diskStats = await this.getDiskStats();
            Object.entries(diskStats).forEach(([mount, usage]) => {
                prometheusMetrics.metrics.diskUsage
                    .labels(mount)
                    .set(usage);
            });

            // System Health
            const health = {
                cpu: cpuUsage < 0.8,
                memory: memUsage < 0.9,
                disk: Object.values(diskStats).every(usage => usage < 0.9)
            };

            prometheusMetrics.updateSystemHealth(health);
        } catch (error) {
            console.error('Error collecting system metrics:', error);
        }
    }

    /**
     * Collects database-related metrics
     */
    async collectDatabaseMetrics() {
        try {
            // Get all databases
            const databases = await db.all(`
                SELECT d.*, 
                    COUNT(du.id) as user_count,
                    (SELECT page_count * page_size 
                     FROM dbstat 
                     WHERE name = d.name) as size_bytes
                FROM database d
                LEFT JOIN database_user du ON d.id = du.database_id
                GROUP BY d.id
            `);

            // Update metrics
            prometheusMetrics.metrics.activeDatabases
                .set(databases.length);

            databases.forEach(database => {
                prometheusMetrics.metrics.databaseSize
                    .labels(database.name)
                    .set(database.size_bytes || 0);
            });
        } catch (error) {
            console.error('Error collecting database metrics:', error);
        }
    }

    /**
     * Collects SSL certificate metrics
     */
    async collectCertificateMetrics() {
        try {
            const certificates = await db.all(`
                SELECT c.*, s.domain_name
                FROM certificate c
                JOIN site s ON c.site_id = s.id
                WHERE c.expires_at IS NOT NULL
            `);

            prometheusMetrics.updateCertificateMetrics(certificates);
        } catch (error) {
            console.error('Error collecting certificate metrics:', error);
        }
    }

    /**
     * Collects site-related metrics
     */
    async collectSiteMetrics() {
        try {
            // Get active sites count
            const siteCount = await db.get(`
                SELECT COUNT(*) as count FROM site
                WHERE status = 1
            `);

            prometheusMetrics.metrics.activeSites
                .set(siteCount.count);

            // Get site creation rate (last 24 hours)
            const newSites = await db.get(`
                SELECT COUNT(*) as count FROM site
                WHERE created_at > datetime('now', '-1 day')
            `);

            prometheusMetrics.metrics.siteCreationRate
                .inc(newSites.count);
        } catch (error) {
            console.error('Error collecting site metrics:', error);
        }
    }

    /**
     * Collects user-related metrics
     */
    async collectUserMetrics() {
        try {
            // Get active users
            const activeUsers = await db.get(`
                SELECT COUNT(*) as count FROM user
                WHERE status = 1
            `);

            prometheusMetrics.metrics.activeUsers
                .set(activeUsers.count);

            // Get active sessions
            const activeSessions = await db.get(`
                SELECT COUNT(*) as count FROM user_session
                WHERE expires_at > datetime('now')
            `);

            prometheusMetrics.metrics.userSessions
                .set(activeSessions.count);
        } catch (error) {
            console.error('Error collecting user metrics:', error);
        }
    }

    /**
     * Gets disk usage statistics
     */
    async getDiskStats() {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        try {
            const { stdout } = await execAsync('df -B1');
            const stats = {};

            stdout.split('\n').slice(1).forEach(line => {
                const [filesystem, size, used, , percentage, mount] = line.split(/\s+/);
                if (mount && mount !== '/dev' && !mount.startsWith('/sys')) {
                    stats[mount] = parseInt(used) / parseInt(size);
                }
            });

            return stats;
        } catch (error) {
            console.error('Error getting disk stats:', error);
            return {};
        }
    }

    /**
     * Collects performance metrics for a specific operation
     * @param {string} operation - Operation name
     * @param {Function} callback - Operation to measure
     */
    async measureOperationTime(operation, callback) {
        const startTime = process.hrtime();
        
        try {
            const result = await callback();
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const duration = seconds + nanoseconds / 1e9;

            prometheusMetrics.metrics.requestDuration
                .labels('internal', operation, 'success')
                .observe(duration);

            return result;
        } catch (error) {
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const duration = seconds + nanoseconds / 1e9;

            prometheusMetrics.metrics.requestDuration
                .labels('internal', operation, 'error')
                .observe(duration);

            throw error;
        }
    }

    /**
     * Records backup-related metrics
     * @param {Object} backupInfo - Backup operation information
     */
    async recordBackupMetrics(backupInfo) {
        try {
            const { size, duration, type } = backupInfo;
            
            prometheusMetrics.metrics.lastBackupTimestamp.set(Date.now() / 1000);
            
            // Record backup size if available
            if (size) {
                prometheusMetrics.metrics.resourceUsage
                    .labels('backup_size')
                    .set(size);
            }

            // Record backup duration if available
            if (duration) {
                prometheusMetrics.metrics.requestDuration
                    .labels('backup', type, 'success')
                    .observe(duration);
            }
        } catch (error) {
            console.error('Error recording backup metrics:', error);
        }
    }

    /**
     * Runs a health check across all monitored components
     * @returns {Object} Health check results
     */
    async runHealthCheck() {
        const results = {
            database: false,
            filesystem: false,
            webserver: false,
            metrics: false
        };

        try {
            // Check database connectivity
            await db.get('SELECT 1');
            results.database = true;

            // Check filesystem access
            const testFile = path.join(os.tmpdir(), 'health-check.tmp');
            await fs.promises.writeFile(testFile, 'test');
            await fs.promises.unlink(testFile);
            results.filesystem = true;

            // Check metrics system
            const metricsData = await prometheusMetrics.getMetricsJson();
            results.metrics = Object.keys(metricsData).length > 0;

            // Update health status metrics
            prometheusMetrics.updateSystemHealth(results);

            return results;
        } catch (error) {
            console.error('Health check failed:', error);
            return results;
        }
    }

    /**
     * Performs cleanup of old metric data
     */
    async cleanupOldMetrics() {
        try {
            const retentionDays = 30; // Configure as needed

            await db.run(`
                DELETE FROM instance_cpu 
                WHERE created_at < datetime('now', '-' || ? || ' days')
            `, [retentionDays]);

            await db.run(`
                DELETE FROM instance_memory 
                WHERE created_at < datetime('now', '-' || ? || ' days')
            `, [retentionDays]);

            await db.run(`
                DELETE FROM instance_disk_usage 
                WHERE created_at < datetime('now', '-' || ? || ' days')
            `, [retentionDays]);

            console.log('Old metrics cleaned up successfully');
        } catch (error) {
            console.error('Error cleaning up old metrics:', error);
        }
    }

    /**
     * Formats collected metrics for logging or display
     * @returns {Object} Formatted metrics
     */
    async getFormattedMetrics() {
        try {
            const metrics = await prometheusMetrics.getMetricsJson();
            
            return {
                timestamp: new Date().toISOString(),
                system: {
                    cpu: metrics.cloudpanel_resource_usage_ratio.values
                        .find(v => v.labels.resource_type === 'cpu')?.value || 0,
                    memory: metrics.cloudpanel_resource_usage_ratio.values
                        .find(v => v.labels.resource_type === 'memory')?.value || 0,
                    disk: Object.fromEntries(
                        metrics.cloudpanel_disk_usage_bytes.values
                            .map(v => [v.labels.mount_point, formatFileSize(v.value)])
                    )
                },
                services: {
                    sites: metrics.cloudpanel_active_sites_total.value,
                    databases: metrics.cloudpanel_active_databases_total.value,
                    users: metrics.cloudpanel_active_users_total.value
                },
                certificates: {
                    valid: metrics.cloudpanel_ssl_certificates_total.values
                        .find(v => v.labels.status === 'valid')?.value || 0,
                    expiring: metrics.cloudpanel_ssl_certificates_total.values
                        .find(v => v.labels.status === 'expiring')?.value || 0
                }
            };
        } catch (error) {
            console.error('Error formatting metrics:', error);
            return null;
        }
    }
}

// Create and export singleton instance
const metricCollectors = new MetricCollectors();

export default metricCollectors;