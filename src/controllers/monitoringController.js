// src/controllers/monitoringController.js
import { db } from '../config/database.js';
import { roundToDecimal } from '../utils/numbers.js';

/**
 * Controller for system monitoring and metrics collection
 * Handles resource usage tracking and performance monitoring
 * Integrates with CloudPanel's monitoring tables:
 * - instance_cpu: CPU usage metrics
 * - instance_memory: Memory usage metrics
 * - instance_load_average: System load metrics
 * - instance_disk_usage: Disk usage metrics
 */
export const monitoringController = {
    /**
     * Get current system resource usage
     * Returns latest metrics for CPU, memory, and disk usage
     */
    async getCurrentMetrics(req, res) {
        try {
            // Get latest CPU usage
            const cpuMetrics = await db.get(`
                SELECT value, created_at 
                FROM instance_cpu 
                ORDER BY created_at DESC 
                LIMIT 1
            `);

            // Get latest memory usage
            const memoryMetrics = await db.get(`
                SELECT value, created_at 
                FROM instance_memory 
                ORDER BY created_at DESC 
                LIMIT 1
            `);

            // Get latest load averages
            const loadMetrics = await db.all(`
                SELECT period, value, created_at 
                FROM instance_load_average 
                WHERE created_at = (
                    SELECT MAX(created_at) 
                    FROM instance_load_average
                )
            `);

            // Get latest disk usage for all monitored disks
            const diskMetrics = await db.all(`
                SELECT disk, value, created_at 
                FROM instance_disk_usage 
                WHERE created_at = (
                    SELECT MAX(created_at) 
                    FROM instance_disk_usage
                )
            `);

            res.json({
                success: true,
                data: {
                    cpu: {
                        usage: cpuMetrics ? roundToDecimal(cpuMetrics.value, 2) : null,
                        timestamp: cpuMetrics?.created_at
                    },
                    memory: {
                        usage: memoryMetrics ? roundToDecimal(memoryMetrics.value, 2) : null,
                        timestamp: memoryMetrics?.created_at
                    },
                    load: {
                        averages: loadMetrics.reduce((acc, curr) => {
                            acc[`${curr.period}min`] = roundToDecimal(curr.value, 2);
                            return acc;
                        }, {}),
                        timestamp: loadMetrics[0]?.created_at
                    },
                    disk: diskMetrics.map(metric => ({
                        disk: metric.disk,
                        usage: roundToDecimal(metric.value, 2),
                        timestamp: metric.created_at
                    }))
                }
            });
        } catch (error) {
            req.logger.error('Error fetching current metrics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch current metrics'
            });
        }
    },

    /**
     * Get historical metrics for specified time range
     * Supports aggregation by different time intervals
     */
    async getHistoricalMetrics(req, res) {
        try {
            const {
                startTime,
                endTime = new Date().toISOString(),
                interval = '1hour'
            } = req.query;

            if (!startTime) {
                return res.status(400).json({
                    success: false,
                    error: 'Start time is required'
                });
            }

            // Convert interval to SQLite time format
            const timeGroup = {
                '5min': '%Y-%m-%d %H:%M',
                '1hour': '%Y-%m-%d %H:00',
                '1day': '%Y-%m-%d'
            }[interval] || '%Y-%m-%d %H:00';

            // Get CPU metrics
            const cpuHistory = await db.all(`
                SELECT 
                    strftime('${timeGroup}', created_at) as time_group,
                    AVG(value) as avg_value,
                    MAX(value) as max_value,
                    MIN(value) as min_value
                FROM instance_cpu
                WHERE created_at BETWEEN ? AND ?
                GROUP BY time_group
                ORDER BY time_group
            `, [startTime, endTime]);

            // Get memory metrics
            const memoryHistory = await db.all(`
                SELECT 
                    strftime('${timeGroup}', created_at) as time_group,
                    AVG(value) as avg_value,
                    MAX(value) as max_value,
                    MIN(value) as min_value
                FROM instance_memory
                WHERE created_at BETWEEN ? AND ?
                GROUP BY time_group
                ORDER BY time_group
            `, [startTime, endTime]);

            res.json({
                success: true,
                data: {
                    interval,
                    timeRange: {
                        start: startTime,
                        end: endTime
                    },
                    metrics: {
                        cpu: cpuHistory.map(record => ({
                            timestamp: record.time_group,
                            average: roundToDecimal(record.avg_value, 2),
                            maximum: roundToDecimal(record.max_value, 2),
                            minimum: roundToDecimal(record.min_value, 2)
                        })),
                        memory: memoryHistory.map(record => ({
                            timestamp: record.time_group,
                            average: roundToDecimal(record.avg_value, 2),
                            maximum: roundToDecimal(record.max_value, 2),
                            minimum: roundToDecimal(record.min_value, 2)
                        }))
                    }
                }
            });
        } catch (error) {
            req.logger.error('Error fetching historical metrics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch historical metrics'
            });
        }
    },

    /**
     * Get system performance alerts and thresholds
     * Returns current alert status and configured thresholds
     */
    async getAlertStatus(req, res) {
        try {
            const currentMetrics = await Promise.all([
                // Get latest CPU usage
                db.get('SELECT value FROM instance_cpu ORDER BY created_at DESC LIMIT 1'),
                // Get latest memory usage
                db.get('SELECT value FROM instance_memory ORDER BY created_at DESC LIMIT 1'),
                // Get latest disk usage
                db.all(`
                    SELECT disk, value 
                    FROM instance_disk_usage 
                    WHERE created_at = (
                        SELECT MAX(created_at) FROM instance_disk_usage
                    )
                `)
            ]);

            const [cpu, memory, disks] = currentMetrics;

            // Define warning thresholds
            const thresholds = {
                cpu: { warning: 80, critical: 90 },
                memory: { warning: 85, critical: 95 },
                disk: { warning: 85, critical: 90 }
            };

            // Generate alerts based on current values
            const alerts = [];

            if (cpu && cpu.value > thresholds.cpu.critical) {
                alerts.push({
                    type: 'cpu',
                    level: 'critical',
                    message: `CPU usage is critically high: ${roundToDecimal(cpu.value, 2)}%`
                });
            } else if (cpu && cpu.value > thresholds.cpu.warning) {
                alerts.push({
                    type: 'cpu',
                    level: 'warning',
                    message: `CPU usage is high: ${roundToDecimal(cpu.value, 2)}%`
                });
            }

            if (memory && memory.value > thresholds.memory.critical) {
                alerts.push({
                    type: 'memory',
                    level: 'critical',
                    message: `Memory usage is critically high: ${roundToDecimal(memory.value, 2)}%`
                });
            } else if (memory && memory.value > thresholds.memory.warning) {
                alerts.push({
                    type: 'memory',
                    level: 'warning',
                    message: `Memory usage is high: ${roundToDecimal(memory.value, 2)}%`
                });
            }

            disks?.forEach(disk => {
                if (disk.value > thresholds.disk.critical) {
                    alerts.push({
                        type: 'disk',
                        level: 'critical',
                        message: `Disk ${disk.disk} usage is critically high: ${roundToDecimal(disk.value, 2)}%`
                    });
                } else if (disk.value > thresholds.disk.warning) {
                    alerts.push({
                        type: 'disk',
                        level: 'warning',
                        message: `Disk ${disk.disk} usage is high: ${roundToDecimal(disk.value, 2)}%`
                    });
                }
            });

            res.json({
                success: true,
                data: {
                    alerts,
                    thresholds,
                    currentStatus: {
                        cpu: cpu?.value ? roundToDecimal(cpu.value, 2) : null,
                        memory: memory?.value ? roundToDecimal(memory.value, 2) : null,
                        disks: disks?.map(disk => ({
                            disk: disk.disk,
                            usage: roundToDecimal(disk.value, 2)
                        })) || []
                    }
                }
            });
        } catch (error) {
            req.logger.error('Error fetching alert status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch alert status'
            });
        }
    }
};