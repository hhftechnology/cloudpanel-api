#!/bin/bash
# /home/clp/scripts/databases/manage_database.sh
#
# This script handles all database operations through CloudPanel's native commands.
# It integrates with the API database to process operations and maintain state.

# Import our utility functions for consistent operation
source /home/clp/scripts/core/database.sh
source /home/clp/scripts/core/logging.sh
source /home/clp/scripts/core/validation.sh

# Set up logging to track all database operations
LOG_FILE="/home/clp/logs/operations/database_operations.log"
OPERATION_ID=""

# Configure error handling to catch all failures
set -e
trap 'handle_error $? "$BASH_COMMAND"' ERR

# Handles any errors that occur during script execution
handle_error() {
    local exit_code=$1
    local failed_command=$2
    log_error "Database operation failed: $failed_command (Exit code: $exit_code)"
    
    # Update the operation status in our tracking database
    if [[ ! -z $OPERATION_ID ]]; then
        update_operation_status $OPERATION_ID "failed" "Command failed: $failed_command"
    fi
    
    cleanup_on_failure
    exit $exit_code
}

# Performs cleanup if an operation fails
cleanup_on_failure() {
    local db_data=$(get_operation_data $OPERATION_ID)
    local db_name=$(echo "$db_data" | jq -r '.database_name')
    
    # If the database was partially created, attempt to remove it
    if mysql -e "SHOW DATABASES LIKE '$db_name'" | grep -q "$db_name"; then
        log_message "Cleaning up failed database: $db_name"
        clpctl db:delete --databaseName="$db_name" || true
    fi
}

# Logs messages with timestamps for tracking
log_message() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
    echo "$message"
}

# Creates a new database and associated user
create_database() {
    local db_data=$1
    
    # Extract database information from the operation data
    local domain_name=$(echo "$db_data" | jq -r '.domain_name')
    local db_name=$(echo "$db_data" | jq -r '.database_name')
    local db_user=$(echo "$db_data" | jq -r '.database_user_name')
    local db_password=$(echo "$db_data" | jq -r '.database_user_password')

    log_message "Creating database: $db_name for domain: $domain_name"

    # Validate database name format
    if [[ ! $db_name =~ ^[a-zA-Z0-9_]+$ ]]; then
        log_error "Invalid database name format: $db_name"
        return 1
    }

    # Create the database using CloudPanel's command
    clpctl db:add \
        --domainName="$domain_name" \
        --databaseName="$db_name" \
        --databaseUserName="$db_user" \
        --databaseUserPassword="$db_password"

    log_message "Database $db_name created successfully with user $db_user"
}

# Deletes a database and its associated users
delete_database() {
    local db_data=$1
    local db_name=$(echo "$db_data" | jq -r '.database_name')

    log_message "Deleting database: $db_name"

    # Check if database exists before attempting deletion
    if ! mysql -e "SHOW DATABASES LIKE '$db_name'" | grep -q "$db_name"; then
        log_message "Database $db_name does not exist"
        update_operation_status $OPERATION_ID "completed" "Database does not exist"
        return 0
    }

    # Create a backup before deletion if specified
    if [[ $(echo "$db_data" | jq -r '.backup_before_delete // "true"') == "true" ]]; then
        local backup_file="/home/clp/backups/databases/${db_name}_pre_deletion_$(date +%Y%m%d_%H%M%S).sql"
        export_database "$db_name" "$backup_file"
    fi

    # Delete the database using CloudPanel's command
    clpctl db:delete --databaseName="$db_name"

    log_message "Database $db_name deleted successfully"
}

# Exports a database to a file
export_database() {
    local db_data=$1
    local db_name=$(echo "$db_data" | jq -r '.database_name')
    local export_file=$(echo "$db_data" | jq -r '.file')

    log_message "Exporting database $db_name to $export_file"

    # Create the backup directory if it doesn't exist
    mkdir -p "$(dirname "$export_file")"

    # Export the database using CloudPanel's command
    clpctl db:export \
        --databaseName="$db_name" \
        --file="$export_file"

    log_message "Database $db_name exported successfully to $export_file"
}

# Imports a database from a file
import_database() {
    local db_data=$1
    local db_name=$(echo "$db_data" | jq -r '.database_name')
    local import_file=$(echo "$db_data" | jq -r '.file')

    log_message "Importing database $db_name from $import_file"

    # Verify the import file exists
    if [[ ! -f "$import_file" ]]; then
        log_error "Import file does not exist: $import_file"
        return 1
    }

    # Import the database using CloudPanel's command
    clpctl db:import \
        --databaseName="$db_name" \
        --file="$import_file"

    log_message "Database $db_name imported successfully from $import_file"
}

# Creates a backup of all databases
backup_databases() {
    local backup_data=$1
    local ignore_dbs=$(echo "$backup_data" | jq -r '.ignore_databases // ""')
    local retention_days=$(echo "$backup_data" | jq -r '.retention_period // "7"')

    log_message "Starting database backup (retention: $retention_days days)"

    # Execute the backup using CloudPanel's command
    if [[ -n "$ignore_dbs" ]]; then
        clpctl db:backup \
            --ignoreDatabases="$ignore_dbs" \
            --retentionPeriod="$retention_days"
    else
        clpctl db:backup --retentionPeriod="$retention_days"
    fi

    log_message "Database backup completed successfully"
}

# Main execution function
main() {
    OPERATION_ID=$2
    local operation=$1
    
    # Get operation data from database
    local operation_data=$(get_operation_data $OPERATION_ID)

    # Update operation status to processing
    update_operation_status $OPERATION_ID "processing"

    # Execute the requested operation
    case "$operation" in
        "create")
            create_database "$operation_data"
            ;;
        "delete")
            delete_database "$operation_data"
            ;;
        "export")
            export_database "$operation_data"
            ;;
        "import")
            import_database "$operation_data"
            ;;
        "backup")
            backup_databases "$operation_data"
            ;;
        *)
            echo "Usage: $0 {create|delete|export|import|backup} operation_id"
            exit 1
            ;;
    esac

    # Update operation status to completed
    update_operation_status $OPERATION_ID "completed"
}

# Execute main function with provided arguments
main "$@"