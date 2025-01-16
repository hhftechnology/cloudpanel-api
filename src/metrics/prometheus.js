// src/metrics/prometheus.js
import client from 'prom-client';
import config from '../config/config.js';

/**
 * Prometheus Metrics Manager for CloudPanel
 * Configures and manages Prometheus metrics collection for the application.
 * Sets up both default Node.js metrics and custom CloudPanel-specific metrics.
 */
class PrometheusMetrics {
    constructor() {
        // Initialize with default settings
        this.prefix = 'cloudpanel_';
        this.register = new client.Registry();
        
        // Define metric collections
        this.metrics = {
            // Site metrics
            activeSites: new client.Gauge({
                name: this.prefix + 'active_sites_total',
                help: 'Total number of active sites'
            }),
            siteCreationRate: new client.Counter({
                name: this.prefix + 'site_creations_total',
                help: 'Total number of sites created'
            }),

            // Database metrics
            activeDatabases: new client.Gauge({
                name: this.prefix + 'active_databases_total',
                help: 'Total number of active databases'
            }),
            databaseSize: new client.Gauge({
                name: this.prefix + 'database_size_bytes',
                help: 'Database size in bytes',
                labelNames: ['database_name']
            }),

            // Resource metrics
            resourceUsage: new client.Gauge({
                name: this.prefix + 'resource_usage_ratio',
                help: 'Resource usage ratio (0-1)',
                labelNames: ['resource_type']
            }),
            diskUsage: new client.Gauge({
                name: this.prefix + 'disk_usage_bytes',
                help: 'Disk usage in bytes',
                labelNames: ['mount_point']
            }),

            // Performance metrics
            requestDuration: new client.Histogram({
                name: this.prefix + 'http_request_duration_seconds',
                help: 'HTTP request duration in seconds',
                labelNames: ['method', 'route', 'status_code'],
                buckets: [0.1, 0.5, 1, 2, 5]
            }),
            requestTotal: new client.Counter({
                name: this.prefix + 'http_requests_total',
                help: 'Total number of HTTP requests',
                labelNames: ['method', 'route', 'status_code']
            }),

            // Certificate metrics
            sslCertificates: new client.Gauge({
                name: this.prefix + 'ssl_certificates_total',
                help: 'Total number of SSL certificates',
                labelNames: ['status']
            }),
            certExpiryDays: new client.Gauge({
                name: this.prefix + 'ssl_certificate_expiry_days',
                help: 'Days until SSL certificate expiry',
                labelNames: ['domain']
            }),

            // User metrics
            activeUsers: new client.Gauge({
                name: this.prefix + 'active_users_total',
                help: 'Total number of active users'
            }),
            userSessions: new client.Gauge({
                name: this.prefix + 'active_sessions_total',
                help: 'Total number of active user sessions'
            }),

            // System health metrics
            systemHealth: new client.Gauge({
                name: this.prefix + 'system_health_status',
                help: 'System health status (0=unhealthy, 1=healthy)',
                labelNames: ['component']
            }),
            lastBackupTimestamp: new client.Gauge({
                name: this.prefix + 'last_backup_timestamp_seconds',
                help: 'Timestamp of last successful backup'
            })
        };

        // Register all metrics
        Object.values(this.metrics).forEach(metric => {
            this.register.registerMetric(metric);
        });
    }

    /**
     * Initializes metrics collection
     */
    async initialize() {
        // Clear any existing metrics
        this.register.clear();

        // Enable default Node.js metrics if configured
        if (config.monitoring.metrics.includeDefault) {
            client.collectDefaultMetrics({
                prefix: this.prefix,
                register: this.register,
                gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
            });
        }

        console.log('Prometheus metrics initialized');
    }

    /**
     * Records an HTTP request duration
     */
    recordHttpRequest(method, route, statusCode, duration) {
        this.metrics.requestDuration
            .labels(method, route, statusCode)
            .observe(duration);
        
        this.metrics.requestTotal
            .labels(method, route, statusCode)
            .inc();
    }

    /**
     * Updates resource usage metrics
     */
    updateResourceMetrics(metrics) {
        for (const [resource, value] of Object.entries(metrics)) {
            this.metrics.resourceUsage
                .labels(resource)
                .set(value);
        }
    }

    /**
     * Updates certificate metrics
     */
    updateCertificateMetrics(certificates) {
        const statusCount = {
            valid: 0,
            expired: 0,
            expiring: 0
        };

        certificates.forEach(cert => {
            const daysToExpiry = Math.ceil(
                (new Date(cert.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
            );

            this.metrics.certExpiryDays
                .labels(cert.domain)
                .set(daysToExpiry);

            if (daysToExpiry < 0) {
                statusCount.expired++;
            } else if (daysToExpiry < 30) {
                statusCount.expiring++;
            } else {
                statusCount.valid++;
            }
        });

        Object.entries(statusCount).forEach(([status, count]) => {
            this.metrics.sslCertificates
                .labels(status)
                .set(count);
        });
    }

    /**
     * Updates database metrics
     */
    updateDatabaseMetrics(databases) {
        this.metrics.activeDatabases.set(databases.length);

        databases.forEach(db => {
            this.metrics.databaseSize
                .labels(db.name)
                .set(db.size_bytes);
        });
    }

    /**
     * Updates system health metrics
     */
    updateSystemHealth(components) {
        Object.entries(components).forEach(([component, status]) => {
            this.metrics.systemHealth
                .labels(component)
                .set(status ? 1 : 0);
        });
    }

    /**
     * Records a successful backup
     */
    recordBackupSuccess() {
        this.metrics.lastBackupTimestamp.set(Date.now() / 1000);
    }

    /**
     * Gets current metric values
     */
    async getMetrics() {
        return this.register.metrics();
    }

    /**
     * Gets metrics in JSON format
     */
    async getMetricsJson() {
        return this.register.getMetricsAsJSON();
    }

    /**
     * Resets all metrics
     */
    resetMetrics() {
        Object.values(this.metrics).forEach(metric => {
            if (metric.reset) {
                metric.reset();
            }
        });
    }
}

// Create and export singleton instance
const prometheusMetrics = new PrometheusMetrics();

export default prometheusMetrics;