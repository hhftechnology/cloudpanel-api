// src/services/monitoringService.js
import { db } from '../config/database.js';
import { handleDatabaseError } from '../middleware/errorHandler.js';
import { roundToDecimal } from '../utils/numbers.js';

/**
 * Service for handling system monitoring and performance metrics in CloudPanel.
 * This service collects, analyzes, and manages system performance data including
 * CPU usage, memory utilization, disk space, and load averages. It provides
 * both real-time monitoring capabilities and historical data analysis.
 */
class MonitoringService {
    /**
     * Retrieves the current system metrics including CPU, memory, disk usage,
     * and load averages. This provides a snapshot of the system's current state
     * and is essential for real-time monitoring dashboards.
     */
    async getCurrentMetrics() {
        try {
            // We collect all metrics in parallel for better performance
            const [cpuMetrics, memoryMetrics, loadMetrics, diskMetrics] = await Promise.all([
                this.getLatestCPUMetrics(),
                this.getLatestMemoryMetrics(),
                this.getLatestLoadAverages(),
                this.getLatestDiskMetrics()
            ]);

            // Format metrics into a structured response
            return {
                timestamp: new Date().toISOString(),
                cpu: {
                    usage: cpuMetrics ? roundToDecimal(cpuMetrics.value, 2) : null,
                    timestamp: cpuMetrics?.created_at
                },
                memory: {
                    usage: memoryMetrics ? roundToDecimal(memoryMetrics.value, 2) : null,
                    timestamp: memoryMetrics?.created_at
                },
                load: this.formatLoadAverages(loadMetrics),
                disk: this.formatDiskMetrics(diskMetrics)
            };
        } catch (error) {
            throw handleDatabaseError(error);
        }
    }

    /**
     * Retrieves historical metrics for a specified time range. This method supports
     * different aggregation intervals (5min, 1hour, 1day) and allows for trend
     * analysis and performance monitoring over time.
     */
    async getHistoricalMetrics(startTime, endTime = new Date().toISOString(), interval = '1hour') {
        try {
            // Convert interval to SQLite time format
            const timeGroup = this.getTimeGroupFormat(interval);

            // Fetch historical data for each metric type
            const [cpuHistory, memoryHistory, loadHistory, diskHistory] = await Promise.all([
                this.getHistoricalCPUMetrics(startTime, endTime, timeGroup),
                this.getHistoricalMemoryMetrics(startTime, endTime, timeGroup),
                this.getHistoricalLoadMetrics(startTime, endTime, timeGroup),
                this.getHistoricalDiskMetrics(startTime, endTime, timeGroup)
            ]);

            return {
                interval,
                timeRange: { startTime, endTime },
                metrics: {
                    cpu: this.formatHistoricalMetrics(cpuHistory),
                    memory: this.formatHistoricalMetrics(memoryHistory),
                    load: this.formatHistoricalLoadMetrics(loadHistory),
                    disk: this.formatHistoricalDiskMetrics(diskHistory)
                }
            };
        } catch (error) {
            throw handleDatabaseError(error);
        }
    }

    /**
     * Checks system metrics against defined thresholds and generates alerts
     * when metrics exceed warning or critical levels. This is crucial for
     * proactive system monitoring and issue prevention.
     */
    async checkAlertConditions() {
        const thresholds = {
            cpu: { warning: 80, critical: 90 },
            memory: { warning: 85, critical: 95 },
            disk: { warning: 85, critical: 90 }
        };

        const currentMetrics = await this.getCurrentMetrics();
        const alerts = [];

        // Check CPU usage
        if (currentMetrics.cpu.usage > thresholds.cpu.critical) {
            alerts.push({
                type: 'cpu',
                level: 'critical',
                message: `CPU usage critically high: ${currentMetrics.cpu.usage}%`,
                value: currentMetrics.cpu.usage,
                threshold: thresholds.cpu.critical
            });
        } else if (currentMetrics.cpu.usage > thresholds.cpu.warning) {
            alerts.push({
                type: 'cpu',
                level: 'warning',
                message: `CPU usage high: ${currentMetrics.cpu.usage}%`,
                value: currentMetrics.cpu.usage,
                threshold: thresholds.cpu.warning
            });
        }

        // Check memory usage
        if (currentMetrics.memory.usage > thresholds.memory.critical) {
            alerts.push({
                type: 'memory',
                level: 'critical',
                message: `Memory usage critically high: ${currentMetrics.memory.usage}%`,
                value: currentMetrics.memory.usage,
                threshold: thresholds.memory.critical
            });
        } else if (currentMetrics.memory.usage > thresholds.memory.warning) {
            alerts.push({
                type: 'memory',
                level: 'warning',
                message: `Memory usage high: ${currentMetrics.memory.usage}%`,
                value: currentMetrics.memory.usage,
                threshold: thresholds.memory.warning
            });
        }

        // Check disk usage
        for (const disk of currentMetrics.disk) {
            if (disk.usage > thresholds.disk.critical) {
                alerts.push({
                    type: 'disk',
                    level: 'critical',
                    message: `Disk ${disk.disk} usage critically high: ${disk.usage}%`,
                    value: disk.usage,
                    threshold: thresholds.disk.critical,
                    disk: disk.disk
                });
            } else if (disk.usage > thresholds.disk.warning) {
                alerts.push({
                    type: 'disk',
                    level: 'warning',
                    message: `Disk ${disk.disk} usage high: ${disk.usage}%`,
                    value: disk.usage,
                    threshold: thresholds.disk.warning,
                    disk: disk.disk
                });
            }
        }

        // Store alerts in the database and trigger notifications if needed
        if (alerts.length > 0) {
            await this.storeAlerts(alerts);
            await this.triggerAlertNotifications(alerts);
        }

        return {
            alerts,
            thresholds,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Analyzes system performance trends over time to identify potential
     * issues before they become critical. This method uses statistical
     * analysis to detect anomalies and concerning trends.
     */
    async analyzeTrends(days = 7) {
        const endTime = new Date();
        const startTime = new Date(endTime - days * 24 * 60 * 60 * 1000);

        try {
            const metrics = await this.getHistoricalMetrics(
                startTime.toISOString(),
                endTime.toISOString(),
                '1hour'
            );

            return {
                cpu: this.calculateTrends(metrics.metrics.cpu),
                memory: this.calculateTrends(metrics.metrics.memory),
                disk: this.calculateDiskTrends(metrics.metrics.disk),
                timeRange: { startTime, endTime }
            };
        } catch (error) {
            throw handleDatabaseError(error);
        }
    }

    // Helper methods for metric retrieval and formatting

    async getLatestCPUMetrics() {
        return db.get(`
            SELECT value, created_at 
            FROM instance_cpu 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
    }

    async getLatestMemoryMetrics() {
        return db.get(`
            SELECT value, created_at 
            FROM instance_memory 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
    }

    async getLatestLoadAverages() {
        return db.all(`
            SELECT period, value, created_at 
            FROM instance_load_average 
            WHERE created_at = (
                SELECT MAX(created_at) 
                FROM instance_load_average
            )
        `);
    }

    async getLatestDiskMetrics() {
        return db.all(`
            SELECT disk, value, created_at 
            FROM instance_disk_usage 
            WHERE created_at = (
                SELECT MAX(created_at) 
                FROM instance_disk_usage
            )
        `);
    }

    // Helper methods for formatting and calculations

    getTimeGroupFormat(interval) {
        const formats = {
            '5min': '%Y-%m-%d %H:%M',
            '1hour': '%Y-%m-%d %H:00',
            '1day': '%Y-%m-%d'
        };
        return formats[interval] || formats['1hour'];
    }

    formatLoadAverages(metrics) {
        if (!metrics || metrics.length === 0) return null;
        
        return {
            averages: metrics.reduce((acc, curr) => {
                acc[`${curr.period}min`] = roundToDecimal(curr.value, 2);
                return acc;
            }, {}),
            timestamp: metrics[0].created_at
        };
    }

    formatDiskMetrics(metrics) {
        if (!metrics) return [];
        
        return metrics.map(metric => ({
            disk: metric.disk,
            usage: roundToDecimal(metric.value, 2),
            timestamp: metric.created_at
        }));
    }

    calculateTrends(metrics) {
        // Calculate moving averages and detect trends
        const values = metrics.map(m => m.value);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const trend = this.calculateTrendDirection(values);
        
        return {
            average: roundToDecimal(avg, 2),
            trend: trend,
            min: Math.min(...values),
            max: Math.max(...values),
            standardDeviation: this.calculateStandardDeviation(values)
        };
    }

    calculateTrendDirection(values) {
        if (values.length < 2) return 'stable';
        
        const recentValues = values.slice(-24); // Last 24 points
        const trend = recentValues.reduce((acc, val, i) => {
            if (i === 0) return 0;
            return acc + (val - recentValues[i - 1]);
        }, 0);

        if (trend > 0) return 'increasing';
        if (trend < 0) return 'decreasing';
        return 'stable';
    }

    calculateStandardDeviation(values) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
        return roundToDecimal(Math.sqrt(avgSquareDiff), 2);
    }

    // Alert handling methods

    async storeAlerts(alerts) {
        await db.run('BEGIN TRANSACTION');
        try {
            for (const alert of alerts) {
                await db.run(`
                    INSERT INTO system_alert (
                        type, level, message, value, threshold,
                        created_at, is_resolved
                    ) VALUES (?, ?, ?, ?, ?, datetime('now'), 0)
                `, [
                    alert.type,
                    alert.level,
                    alert.message,
                    alert.value,
                    alert.threshold
                ]);
            }
            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }

    async triggerAlertNotifications(alerts) {
        // Implementation would send notifications through configured channels
        // (email, Slack, webhook, etc.)
        return true;
    }
}

export default new MonitoringService();