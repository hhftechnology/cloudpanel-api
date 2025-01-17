#!/bin/bash
# /home/clp/scripts/maintenance/system_maintenance.sh
#
# This script manages system maintenance tasks for CloudPanel installations.
# It handles log rotation, backup management, temporary file cleanup,
# system optimization, and security checks. The script integrates with
# CloudPanel's native commands while adding additional maintenance features.

# Import our utility functions for consistent operation
source /home/clp/scripts/core/database.sh
source /home/clp/scripts/core/logging.sh
source /home/clp/scripts/core/validation.sh

# Set up logging for maintenance operations
LOG_FILE="/home/clp/logs/operations/maintenance.log"
OPERATION_ID=""

# Define paths for maintenance operations
BACKUP_DIR="/home/clp/backups"
TEMP_DIR="/home/clp/tmp"
LOG_DIR="/home/clp/logs"

# Configure maintenance settings
MAX_LOG_AGE=30          # Days to keep logs
MAX_BACKUP_AGE=90       # Days to keep backups
TEMP_FILE_AGE=7         # Days to keep temporary files
MIN_FREE_SPACE=20       # Minimum free space percentage

# Error handling configuration
set -e
trap 'handle_error $? "$BASH_COMMAND"' ERR

handle_error() {
    local exit_code=$1
    local failed_command=$2
    log_error "Maintenance operation failed: $failed_command (Exit code: $exit_code)"
    
    if [[ ! -z $OPERATION_ID ]]; then
        update_operation_status $OPERATION_ID "failed" "Command failed: $failed_command"
    fi
}

log_message() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
    echo "$message"
}

# Function to rotate and compress old log files
rotate_logs() {
    log_message "Starting log rotation process"

    # Find and compress logs older than 1 day
    find "$LOG_DIR" -type f -name "*.log" -not -name "*.gz" -mtime +1 | while read log_file; do
        gzip "$log_file"
        log_message "Compressed log file: $log_file"
    done

    # Remove logs older than MAX_LOG_AGE days
    find "$LOG_DIR" -type f -name "*.gz" -mtime +$MAX_LOG_AGE -delete
    log_message "Removed old log files"

    # Update log file timestamps to ensure proper rotation
    touch "$LOG_DIR"/*.log
}

# Function to manage system backups
manage_backups() {
    log_message "Managing system backups"

    # Create new system backup
    log_message "Creating new system backup"
    clpctl remote-backup:create

    # Remove old backups
    log_message "Cleaning old backups"
    find "$BACKUP_DIR" -type f -mtime +$MAX_BACKUP_AGE -delete

    # Verify backup integrity
    verify_backups
}

# Function to verify backup integrity
verify_backups() {
    log_message "Verifying backup integrity"

    find "$BACKUP_DIR" -type f -name "*.tar.gz" -mtime -1 | while read backup_file; do
        if ! tar -tzf "$backup_file" >/dev/null 2>&1; then
            send_alert "CRITICAL" "Backup Integrity" "Backup file is corrupted: $backup_file"
        else
            log_message "Verified backup integrity: $backup_file"
        fi
    done
}

# Function to clean temporary files
clean_temp_files() {
    log_message "Cleaning temporary files"

    # Remove old temporary files
    find "$TEMP_DIR" -type f -mtime +$TEMP_FILE_AGE -delete
    find "$TEMP_DIR" -type d -empty -delete

    # Clean PHP session files
    find /var/lib/php/sessions/ -type f -mtime +1 -delete

    # Clean Varnish cache if enabled
    if systemctl is-active --quiet varnish; then
        varnishadm "ban req.url ~ ."
        log_message "Cleared Varnish cache"
    fi
}

# Function to optimize system performance
optimize_system() {
    log_message "Starting system optimization"

    # Optimize MySQL databases
    log_message "Optimizing MySQL databases"
    clpctl db:show:master-credentials | while read line; do
        mysql -e "SELECT concat('OPTIMIZE TABLE ', table_schema, '.', table_name, ';') 
                 FROM information_schema.tables WHERE table_schema NOT IN 
                 ('information_schema', 'performance_schema', 'mysql')" | \
        mysql >/dev/null 2>&1
    done

    # Clean package cache
    log_message "Cleaning package cache"
    apt-get clean
    apt-get autoremove -y

    # Optimize PHP opcache
    if systemctl is-active --quiet php*-fpm; then
        kill -USR2 $(cat /var/run/php/php*-fpm.pid)
        log_message "Reset PHP opcache"
    fi
}

# Function to check and maintain system security
check_security() {
    log_message "Performing security checks"

    # Check file permissions
    log_message "Checking file permissions"
    clpctl system:permissions:reset \
        --path=/home/clp \
        --directories=770 \
        --files=660

    # Check for unauthorized SSH keys
    log_message "Checking SSH keys"
    find /home -name "authorized_keys" | while read keyfile; do
        if ! grep -q "CLOUDPANEL" "$keyfile"; then
            send_alert "WARNING" "Security" "Unauthorized SSH key found in: $keyfile"
        fi
    done

    # Check basic auth configuration
    if ! clpctl cloudpanel:enable:basic-auth --status >/dev/null 2>&1; then
        send_alert "WARNING" "Security" "CloudPanel basic auth is not enabled"
    fi
}

# Function to perform disk space cleanup
clean_disk_space() {
    log_message "Starting disk space cleanup"

    # Get current disk usage
    local disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    local free_space=$((100 - disk_usage))

    if [[ $free_space -lt $MIN_FREE_SPACE ]]; then
        log_message "Low disk space detected ($free_space% free). Starting cleanup..."

        # Clean old logs
        find "$LOG_DIR" -type f -name "*.gz" -delete

        # Clean old backups except the most recent
        find "$BACKUP_DIR" -type f -mtime +30 -delete

        # Clean package cache
        apt-get clean
        apt-get autoremove -y

        # After cleanup, check space again
        disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
        free_space=$((100 - disk_usage))

        if [[ $free_space -lt $MIN_FREE_SPACE ]]; then
            send_alert "CRITICAL" "Disk Space" "Low disk space persists after cleanup: $free_space% free"
        fi
    fi
}

# Function to perform complete system maintenance
perform_maintenance() {
    log_message "Starting complete system maintenance"

    # Perform all maintenance tasks in order
    rotate_logs
    manage_backups
    clean_temp_files
    optimize_system
    check_security
    clean_disk_space

    log_message "System maintenance completed successfully"
}

# Main execution function
main() {
    OPERATION_ID=$2
    local operation=$1
    
    # Update operation status to processing if we have an operation ID
    [[ ! -z $OPERATION_ID ]] && update_operation_status $OPERATION_ID "processing"

    case "$operation" in
        "full")
            perform_maintenance
            ;;
        "logs")
            rotate_logs
            ;;
        "backups")
            manage_backups
            ;;
        "cleanup")
            clean_temp_files
            clean_disk_space
            ;;
        "optimize")
            optimize_system
            ;;
        "security")
            check_security
            ;;
        *)
            echo "Usage: $0 {full|logs|backups|cleanup|optimize|security} [operation_id]"
            exit 1
            ;;
    esac

    # Update operation status to completed if we have an operation ID
    [[ ! -z $OPERATION_ID ]] && update_operation_status $OPERATION_ID "completed"
}

# Execute main function with provided arguments
main "$@"