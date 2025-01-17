#!/bin/bash
# /home/clp/scripts/orchestrator/status_monitor.sh
#
# This script monitors operation statuses, handles timeouts, and manages retries.
# It works alongside queue_worker.sh but focuses on monitoring rather than processing.

source /home/clp/scripts/core/database.sh
source /home/clp/scripts/core/logging.sh

# Configuration
MONITOR_LOG="/home/clp/logs/orchestrator/status_monitor.log"
MAX_OPERATION_TIME=3600  # 1 hour in seconds
MAX_RETRIES=3
STUCK_THRESHOLD=1800     # 30 minutes in seconds
CHECK_INTERVAL=60        # Check every minute

# Error handling
set -e
trap 'handle_error $? "$BASH_COMMAND"' ERR

handle_error() {
    local exit_code=$1
    local failed_command=$2
    log_error "Status monitor error: $failed_command (Exit code: $exit_code)"
}

log_monitor() {
    local message="$1"
    log_message "$message" "$MONITOR_LOG"
}

check_stuck_operations() {
    log_monitor "Checking for stuck operations"
    
    # Find operations stuck in "processing" state
    local stuck_ops=$(sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        SELECT id, type, started_at 
        FROM operations 
        WHERE status = 'processing' 
        AND datetime('now', '-30 minutes') > started_at
    ")
    
    if [[ -n "$stuck_ops" ]]; then
        while IFS='|' read -r op_id op_type start_time; do
            handle_stuck_operation "$op_id" "$op_type" "$start_time"
        done <<< "$stuck_ops"
    fi
}

handle_stuck_operation() {
    local op_id=$1
    local op_type=$2
    local start_time=$3
    
    log_monitor "Handling stuck operation: $op_id ($op_type)"
    
    # Get current retry count
    local retries=$(sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        SELECT retry_count FROM operations WHERE id = $op_id
    ")
    
    if [[ $retries -lt $MAX_RETRIES ]]; then
        # Increment retry count and reset status
        sqlite3 /home/clp/htdocs/app/data/db.sq3 "
            UPDATE operations 
            SET status = 'pending',
                retry_count = retry_count + 1,
                error = 'Operation stuck - attempting retry'
            WHERE id = $op_id
        "
        log_monitor "Reset stuck operation $op_id for retry (attempt $((retries + 1)))"
    else
        # Mark as failed after max retries
        sqlite3 /home/clp/htdocs/app/data/db.sq3 "
            UPDATE operations 
            SET status = 'failed',
                error = 'Operation failed after $MAX_RETRIES retries'
            WHERE id = $op_id
        "
        log_monitor "Operation $op_id failed after maximum retries"
    fi
}

check_timed_out_operations() {
    log_monitor "Checking for timed out operations"
    
    # Find operations that have exceeded maximum time
    local timed_out_ops=$(sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        SELECT id, type
        FROM operations 
        WHERE status = 'processing'
        AND datetime('now', '-1 hour') > started_at
    ")
    
    if [[ -n "$timed_out_ops" ]]; then
        while IFS='|' read -r op_id op_type; do
            handle_timeout "$op_id" "$op_type"
        done <<< "$timed_out_ops"
    fi
}

handle_timeout() {
    local op_id=$1
    local op_type=$2
    
    log_monitor "Handling timeout for operation: $op_id ($op_type)"
    
    # Get current retry count
    local retries=$(sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        SELECT retry_count FROM operations WHERE id = $op_id
    ")
    
    if [[ $retries -lt $MAX_RETRIES ]]; then
        # Increment retry count and reset status
        sqlite3 /home/clp/htdocs/app/data/db.sq3 "
            UPDATE operations 
            SET status = 'pending',
                retry_count = retry_count + 1,
                error = 'Operation timed out - attempting retry'
            WHERE id = $op_id
        "
        log_monitor "Reset timed out operation $op_id for retry (attempt $((retries + 1)))"
    else
        # Mark as failed after max retries
        sqlite3 /home/clp/htdocs/app/data/db.sq3 "
            UPDATE operations 
            SET status = 'failed',
                error = 'Operation timed out after $MAX_RETRIES retries'
            WHERE id = $op_id
        "
        log_monitor "Operation $op_id failed after timeout and maximum retries"
    fi
}

cleanup_old_operations() {
    log_monitor "Cleaning up old operations"
    
    # Archive completed operations older than 30 days
    sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        INSERT INTO operations_archive 
        SELECT * FROM operations 
        WHERE status IN ('completed', 'failed')
        AND datetime('now', '-30 days') > completed_at;
        
        DELETE FROM operations 
        WHERE status IN ('completed', 'failed')
        AND datetime('now', '-30 days') > completed_at;
    "
}

generate_status_report() {
    log_monitor "Generating status report"
    
    # Get operation statistics
    local stats=$(sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            AVG(CASE WHEN status = 'completed' THEN 
                (strftime('%s', completed_at) - strftime('%s', started_at))
            ELSE NULL END) as avg_duration
        FROM operations 
        WHERE datetime('now', '-24 hours') < created_at
    ")
    
    log_monitor "Daily Status Report:"
    log_monitor "$stats"
}

# Main monitoring loop
monitor_status() {
    log_monitor "Starting operation status monitor"
    
    while true; do
        check_stuck_operations
        check_timed_out_operations
        
        # Generate report and cleanup once per day at midnight
        if [[ $(date +%H:%M) == "00:00" ]]; then
            generate_status_report
            cleanup_old_operations
        fi
        
        sleep $CHECK_INTERVAL
    done
}

# Start the monitor
monitor_status