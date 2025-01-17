#!/bin/bash
# /home/clp/scripts/user/manage_user.sh

# Source common utilities
source /home/clp/scripts/core/database.sh
source /home/clp/scripts/core/logging.sh

# Set up logging
LOG_FILE="/home/clp/logs/operations/user_operations.log"

# Error handling
set -e
trap 'handle_error $? "$BASH_COMMAND"' ERR

handle_error() {
    local exit_code=$1
    local failed_command=$2
    log_error "Command failed: $failed_command (Exit code: $exit_code)"
    # Update operation status in database
    [[ ! -z $OPERATION_ID ]] && update_operation_status $OPERATION_ID "failed" "Command failed: $failed_command"
    exit $exit_code
}

log_message() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
    echo "$message"
}

validate_username() {
    local username="$1"
    if [[ ! $username =~ ^[a-zA-Z0-9._-]+$ ]]; then
        log_error "Invalid username format: $username"
        return 1
    fi
}

create_user() {
    local operation_id=$1
    OPERATION_ID=$operation_id  # For error handler
    
    # Get operation data from database
    local user_data=$(get_operation_data $operation_id)
    
    # Extract user information
    local username=$(echo "$user_data" | jq -r '.user_name')
    local email=$(echo "$user_data" | jq -r '.email')
    local firstname=$(echo "$user_data" | jq -r '.first_name')
    local lastname=$(echo "$user_data" | jq -r '.last_name')
    local password=$(echo "$user_data" | jq -r '.password')
    local role=$(echo "$user_data" | jq -r '.role')
    local timezone=$(echo "$user_data" | jq -r '.timezone' || echo 'UTC')
    local status=$(echo "$user_data" | jq -r '.status' || echo '1')

    # Validate username
    validate_username "$username" || exit 1

    log_message "Creating user: $username"

    # Execute clpctl command
    clpctl user:add \
        --userName="$username" \
        --email="$email" \
        --firstName="$firstname" \
        --lastName="$lastname" \
        --password="$password" \
        --role="$role" \
        --timezone="$timezone" \
        --status="$status"

    log_message "User $username created successfully"
    update_operation_status $operation_id "completed"
}

delete_user() {
    local operation_id=$1
    OPERATION_ID=$operation_id

    # Get operation data
    local user_data=$(get_operation_data $operation_id)
    local username=$(echo "$user_data" | jq -r '.user_name')

    # Validate username
    validate_username "$username" || exit 1

    log_message "Deleting user: $username"

    # Check if user exists
    if ! clpctl user:list | grep -q "$username"; then
        log_message "User $username does not exist"
        update_operation_status $operation_id "completed" "User does not exist"
        return 0
    fi

    # Execute delete command
    clpctl user:delete --userName="$username"

    log_message "User $username deleted successfully"
    update_operation_status $operation_id "completed"
}

reset_password() {
    local operation_id=$1
    OPERATION_ID=$operation_id

    # Get operation data
    local user_data=$(get_operation_data $operation_id)
    local username=$(echo "$user_data" | jq -r '.user_name')
    local new_password=$(echo "$user_data" | jq -r '.new_password')

    # Validate username
    validate_username "$username" || exit 1

    log_message "Resetting password for user: $username"

    # Execute password reset
    clpctl user:reset:password \
        --userName="$username" \
        --password="$new_password"

    log_message "Password reset successfully for $username"
    update_operation_status $operation_id "completed"
}

# Main execution
case "$1" in
    "create")
        create_user "$2"
        ;;
    "delete")
        delete_user "$2"
        ;;
    "reset_password")
        reset_password "$2"
        ;;
    *)
        echo "Usage: $0 {create|delete|reset_password} operation_id"
        exit 1
        ;;
esac