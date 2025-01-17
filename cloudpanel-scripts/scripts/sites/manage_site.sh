#!/bin/bash
# /home/clp/scripts/sites/manage_site.sh

# Import our utility functions
source /home/clp/scripts/core/database.sh
source /home/clp/scripts/core/logging.sh
source /home/clp/scripts/core/validation.sh

# Configure logging
LOG_FILE="/home/clp/logs/operations/site_operations.log"
OPERATION_ID=""

# Set up error handling to catch and process all errors
set -e
trap 'handle_error $? "$BASH_COMMAND"' ERR

handle_error() {
    local exit_code=$1
    local failed_command=$2
    log_error "Site operation failed: $failed_command (Exit code: $exit_code)"
    [[ ! -z $OPERATION_ID ]] && update_operation_status $OPERATION_ID "failed" "Command failed: $failed_command"
    cleanup_on_failure
    exit $exit_code
}

cleanup_on_failure() {
    # Get site information from the stored operation data
    local site_data=$(get_operation_data $OPERATION_ID)
    local domain_name=$(echo "$site_data" | jq -r '.domain_name')
    
    # If site was partially created, attempt cleanup
    if [[ -d "/home/cloudpanel/htdocs/$domain_name" ]]; then
        log_message "Cleaning up failed site installation: $domain_name"
        clpctl site:delete --domainName="$domain_name" || true
    fi
}

log_message() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
    echo "$message"
}

create_php_site() {
    local site_data=$1
    
    # Extract site information
    local domain_name=$(echo "$site_data" | jq -r '.domain_name')
    local php_version=$(echo "$site_data" | jq -r '.php_version')
    local site_user=$(echo "$site_data" | jq -r '.user')
    local site_password=$(echo "$site_data" | jq -r '.user_password')
    local vhost_template=$(echo "$site_data" | jq -r '.vhost_template // "Generic"')

    log_message "Creating PHP site: $domain_name (PHP $php_version)"

    # Create the PHP site using clpctl
    clpctl site:add:php \
        --domainName="$domain_name" \
        --phpVersion="$php_version" \
        --vhostTemplate="$vhost_template" \
        --siteUser="$site_user" \
        --siteUserPassword="$site_password"

    # Configure additional PHP settings if specified
    if [[ $(echo "$site_data" | jq 'has("php_settings")') == "true" ]]; then
        local memory_limit=$(echo "$site_data" | jq -r '.php_settings.memory_limit // "256M"')
        local max_execution_time=$(echo "$site_data" | jq -r '.php_settings.max_execution_time // "30"')
        
        # Apply PHP settings using our custom function (to be implemented)
        configure_php_settings "$domain_name" "$memory_limit" "$max_execution_time"
    fi
}

create_nodejs_site() {
    local site_data=$1
    
    # Extract site information
    local domain_name=$(echo "$site_data" | jq -r '.domain_name')
    local nodejs_version=$(echo "$site_data" | jq -r '.nodejs_version')
    local app_port=$(echo "$site_data" | jq -r '.app_port')
    local site_user=$(echo "$site_data" | jq -r '.user')
    local site_password=$(echo "$site_data" | jq -r '.user_password')

    log_message "Creating Node.js site: $domain_name (Node.js $nodejs_version, Port $app_port)"

    # Create the Node.js site using clpctl
    clpctl site:add:nodejs \
        --domainName="$domain_name" \
        --nodejsVersion="$nodejs_version" \
        --appPort="$app_port" \
        --siteUser="$site_user" \
        --siteUserPassword="$site_password"
}

create_python_site() {
    local site_data=$1
    
    # Extract site information
    local domain_name=$(echo "$site_data" | jq -r '.domain_name')
    local python_version=$(echo "$site_data" | jq -r '.python_version')
    local app_port=$(echo "$site_data" | jq -r '.app_port')
    local site_user=$(echo "$site_data" | jq -r '.user')
    local site_password=$(echo "$site_data" | jq -r '.user_password')

    log_message "Creating Python site: $domain_name (Python $python_version, Port $app_port)"

    # Create the Python site using clpctl
    clpctl site:add:python \
        --domainName="$domain_name" \
        --pythonVersion="$python_version" \
        --appPort="$app_port" \
        --siteUser="$site_user" \
        --siteUserPassword="$site_password"
}

create_static_site() {
    local site_data=$1
    
    # Extract site information
    local domain_name=$(echo "$site_data" | jq -r '.domain_name')
    local site_user=$(echo "$site_data" | jq -r '.user')
    local site_password=$(echo "$site_data" | jq -r '.user_password')

    log_message "Creating static site: $domain_name"

    # Create the static site using clpctl
    clpctl site:add:static \
        --domainName="$domain_name" \
        --siteUser="$site_user" \
        --siteUserPassword="$site_password"
}

create_reverse_proxy() {
    local site_data=$1
    
    # Extract site information
    local domain_name=$(echo "$site_data" | jq -r '.domain_name')
    local proxy_url=$(echo "$site_data" | jq -r '.reverse_proxy_url')
    local site_user=$(echo "$site_data" | jq -r '.user')
    local site_password=$(echo "$site_data" | jq -r '.user_password')

    log_message "Creating reverse proxy: $domain_name -> $proxy_url"

    # Create the reverse proxy using clpctl
    clpctl site:add:reverse-proxy \
        --domainName="$domain_name" \
        --reverseProxyUrl="$proxy_url" \
        --siteUser="$site_user" \
        --siteUserPassword="$site_password"
}

delete_site() {
    local site_data=$1
    local domain_name=$(echo "$site_data" | jq -r '.domain_name')

    log_message "Deleting site: $domain_name"

    # Delete the site using clpctl
    clpctl site:delete --domainName="$domain_name"
}

validate_site_data() {
    local site_data=$1
    local site_type=$2

    # Common validations
    if [[ $(echo "$site_data" | jq -r '.domain_name') == "null" ]]; then
        log_error "Domain name is required"
        return 1
    fi

    # Type-specific validations
    case "$site_type" in
        "php")
            if [[ $(echo "$site_data" | jq -r '.php_version') == "null" ]]; then
                log_error "PHP version is required for PHP sites"
                return 1
            fi
            ;;
        "nodejs")
            if [[ $(echo "$site_data" | jq -r '.app_port') == "null" ]]; then
                log_error "Application port is required for Node.js sites"
                return 1
            fi
            ;;
        "python")
            if [[ $(echo "$site_data" | jq -r '.app_port') == "null" ]]; then
                log_error "Application port is required for Python sites"
                return 1
            fi
            ;;
        "reverse-proxy")
            if [[ $(echo "$site_data" | jq -r '.reverse_proxy_url') == "null" ]]; then
                log_error "Reverse proxy URL is required"
                return 1
            fi
            ;;
    esac

    return 0
}

# Main execution function
main() {
    OPERATION_ID=$2
    local operation=$1
    
    # Get operation data from database
    local site_data=$(get_operation_data $OPERATION_ID)
    local site_type=$(echo "$site_data" | jq -r '.type')

    # Validate operation data
    validate_site_data "$site_data" "$site_type" || exit 1

    # Update operation status to processing
    update_operation_status $OPERATION_ID "processing"

    case "$operation" in
        "create")
            case "$site_type" in
                "php")
                    create_php_site "$site_data"
                    ;;
                "nodejs")
                    create_nodejs_site "$site_data"
                    ;;
                "python")
                    create_python_site "$site_data"
                    ;;
                "static")
                    create_static_site "$site_data"
                    ;;
                "reverse-proxy")
                    create_reverse_proxy "$site_data"
                    ;;
                *)
                    log_error "Unknown site type: $site_type"
                    exit 1
                    ;;
            esac
            ;;
        "delete")
            delete_site "$site_data"
            ;;
        *)
            echo "Usage: $0 {create|delete} operation_id"
            exit 1
            ;;
    esac

    # Update operation status to completed
    update_operation_status $OPERATION_ID "completed"
}

# Execute main function with provided arguments
main "$@"