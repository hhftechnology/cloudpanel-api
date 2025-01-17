#!/bin/bash
# /home/clp/scripts/monitoring/system_monitor.sh
#
# This script manages system monitoring and metrics collection for CloudPanel.
# It collects various system metrics, stores them in the database, and triggers
# alerts when thresholds are exceeded. The script uses CloudPanel's native
# commands and integrates with its monitoring system.

# Import our utility functions
source /home/clp/scripts/core/database.sh
source /home/clp/scripts/core/logging.sh
source /home/clp/scripts/core/validation.sh

# Configure logging for monitoring operations
LOG_FILE="/home/clp/logs/operations/monitoring.log"
METRICS_DIR="/home/clp/monitoring/metrics"
ALERT_LOG="/home/clp/logs/alerts.log"

# Define monitoring thresholds
declare -A THRESHOLDS=(
    ["cpu_warning"]=80
    ["cpu_critical"]=90
    ["memory_warning"]=85
    ["memory_critical"]=95
    ["disk_warning"]=85
    ["disk_critical"]=90
    ["load_warning"]=5
    ["load_critical"]=10
)

# Error handling setup
set -e
trap 'handle_error $? "$BASH_COMMAND"' ERR

handle_error() {
    local exit_code=$1
    local failed_command=$2
    log_error "Monitoring operation failed: $failed_command (Exit code: $exit_code)"
    
    # Send alert about monitoring system failure
    send_alert "CRITICAL" "Monitoring system failure" "Monitoring command failed: $failed_command"
}

log_message() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
    echo "$message"
}

# Function to collect CPU metrics
collect_cpu_metrics() {
    log_message "Collecting CPU metrics"
    
    # Get current CPU usage using top
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    
    # Store in database
    sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        INSERT INTO instance_cpu (created_at, value)
        VALUES (datetime('now'), $cpu_usage)
    "
    
    # Check thresholds and send alerts if needed
    if (( $(echo "$cpu_usage >= ${THRESHOLDS[cpu_critical]}" | bc -l) )); then
        send_alert "CRITICAL" "CPU Usage" "CPU usage is critically high: ${cpu_usage}%"
    elif (( $(echo "$cpu_usage >= ${THRESHOLDS[cpu_warning]}" | bc -l) )); then
        send_alert "WARNING" "CPU Usage" "CPU usage is high: ${cpu_usage}%"
    fi
}

# Function to collect memory metrics
collect_memory_metrics() {
    log_message "Collecting memory metrics"
    
    # Get memory usage using free
    local total_mem=$(free | grep Mem: | awk '{print $2}')
    local used_mem=$(free | grep Mem: | awk '{print $3}')
    local mem_usage=$(echo "scale=2; $used_mem * 100 / $total_mem" | bc)
    
    # Store in database
    sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        INSERT INTO instance_memory (created_at, value)
        VALUES (datetime('now'), $mem_usage)
    "
    
    # Check thresholds
    if (( $(echo "$mem_usage >= ${THRESHOLDS[memory_critical]}" | bc -l) )); then
        send_alert "CRITICAL" "Memory Usage" "Memory usage is critically high: ${mem_usage}%"
    elif (( $(echo "$mem_usage >= ${THRESHOLDS[memory_warning]}" | bc -l) )); then
        send_alert "WARNING" "Memory Usage" "Memory usage is high: ${mem_usage}%"
    fi
}

# Function to collect disk usage metrics
collect_disk_metrics() {
    log_message "Collecting disk metrics"
    
    # Get disk usage for all mounted filesystems
    df -h | grep '^/dev' | while read line; do
        local disk=$(echo $line | awk '{print $1}')
        local usage=$(echo $line | awk '{print $5}' | sed 's/%//')
        local mount=$(echo $line | awk '{print $6}')
        
        # Store in database
        sqlite3 /home/clp/htdocs/app/data/db.sq3 "
            INSERT INTO instance_disk_usage (created_at, disk, value)
            VALUES (datetime('now'), '$mount', $usage)
        "
        
        # Check thresholds
        if (( usage >= ${THRESHOLDS[disk_critical]} )); then
            send_alert "CRITICAL" "Disk Usage" "Disk usage on $mount is critically high: ${usage}%"
        elif (( usage >= ${THRESHOLDS[disk_warning]} )); then
            send_alert "WARNING" "Disk Usage" "Disk usage on $mount is high: ${usage}%"
        fi
    done
}

# Function to collect load average metrics
collect_load_metrics() {
    log_message "Collecting load average metrics"
    
    # Get load averages
    local load_1=$(uptime | awk '{print $(NF-2)}' | sed 's/,//')
    local load_5=$(uptime | awk '{print $(NF-1)}' | sed 's/,//')
    local load_15=$(uptime | awk '{print $NF}')
    
    # Store in database
    sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        INSERT INTO instance_load_average (created_at, period, value)
        VALUES 
            (datetime('now'), 1, $load_1),
            (datetime('now'), 5, $load_5),
            (datetime('now'), 15, $load_15)
    "
    
    # Check thresholds against 5-minute load average
    if (( $(echo "$load_5 >= ${THRESHOLDS[load_critical]}" | bc -l) )); then
        send_alert "CRITICAL" "System Load" "System load is critically high: $load_5"
    elif (( $(echo "$load_5 >= ${THRESHOLDS[load_warning]}" | bc -l) )); then
        send_alert "WARNING" "System Load" "System load is high: $load_5"
    fi
}

# Function to check service health
check_services() {
    log_message "Checking service health"
    
    # List of services to check
    local services=("nginx" "php-fpm" "mysql" "varnish")
    
    for service in "${services[@]}"; do
        if ! systemctl is-active --quiet $service; then
            send_alert "CRITICAL" "Service Down" "Service $service is not running"
            
            # Attempt to restart the service
            systemctl restart $service
            
            # Check if restart was successful
            if systemctl is-active --quiet $service; then
                send_alert "INFO" "Service Recovery" "Service $service was successfully restarted"
            else
                send_alert "CRITICAL" "Service Recovery Failed" "Failed to restart service $service"
            fi
        fi
    done
}

# Function to clean old monitoring data
clean_monitoring_data() {
    log_message "Cleaning old monitoring data"
    
    # Use CloudPanel's command for cleaning
    clpctl monitoring:data:clean
    
    log_message "Monitoring data cleaned successfully"
}

# Function to send alerts
send_alert() {
    local severity=$1
    local title=$2
    local message=$3
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Log the alert
    echo "[$timestamp] [$severity] $title: $message" >> "$ALERT_LOG"
    
    # Insert into notifications table
    sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        INSERT INTO notification (
            created_at,
            severity,
            subject,
            message,
            is_read
        ) VALUES (
            datetime('now'),
            '$severity',
            '$title',
            '$message',
            0
        )
    "
}

# Function to perform a full system check
perform_system_check() {
    log_message "Starting full system check"
    
    # Collect all metrics
    collect_cpu_metrics
    collect_memory_metrics
    collect_disk_metrics
    collect_load_metrics
    
    # Check service health
    check_services
    
    # Clean old data periodically
    # Only clean if it's midnight
    if [[ $(date +%H:%M) == "00:00" ]]; then
        clean_monitoring_data
    fi
    
    log_message "System check completed"
}

# Main execution function
main() {
    local operation=$1
    
    case "$operation" in
        "collect")
            perform_system_check
            ;;
        "clean")
            clean_monitoring_data
            ;;
        "services")
            check_services
            ;;
        *)
            echo "Usage: $0 {collect|clean|services}"
            exit 1
            ;;
    esac
}

# Execute main function with provided arguments
main "$@"