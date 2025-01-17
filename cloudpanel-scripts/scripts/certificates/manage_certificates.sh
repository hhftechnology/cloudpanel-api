#!/bin/bash
# /home/clp/scripts/certificates/manage_certificates.sh
#
# This script manages SSL/TLS certificates through CloudPanel's native commands.
# It handles both Let's Encrypt certificates and custom certificate installations.
# The script integrates with the API database for operation tracking and provides
# comprehensive logging and error handling.

# Import our utility functions for consistent operation
source /home/clp/scripts/core/database.sh
source /home/clp/scripts/core/logging.sh
source /home/clp/scripts/core/validation.sh

# Set up logging for certificate operations
LOG_FILE="/home/clp/logs/operations/certificate_operations.log"
OPERATION_ID=""

# Configure error handling to catch and process all failures
set -e
trap 'handle_error $? "$BASH_COMMAND"' ERR

# Error handler function that processes all script failures
# It logs the error, updates the operation status, and performs necessary cleanup
handle_error() {
    local exit_code=$1
    local failed_command=$2
    log_error "Certificate operation failed: $failed_command (Exit code: $exit_code)"
    
    # Update the operation status in our tracking database
    if [[ ! -z $OPERATION_ID ]]; then
        update_operation_status $OPERATION_ID "failed" "Command failed: $failed_command"
    fi
    
    # Perform any necessary cleanup
    cleanup_on_failure
    exit $exit_code
}

# Cleanup function that handles any necessary cleanup after a failed operation
cleanup_on_failure() {
    local cert_data=$(get_operation_data $OPERATION_ID)
    local domain_name=$(echo "$cert_data" | jq -r '.domain_name')
    
    # Clean up any partial certificate files
    if [[ -f "/etc/nginx/ssl-certificates/${domain_name}.tmp" ]]; then
        rm -f "/etc/nginx/ssl-certificates/${domain_name}.tmp"
    fi
}

# Function to log messages with timestamps
log_message() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE"
    echo "$message"
}

# Function to install a Let's Encrypt certificate for a domain
# This handles both initial installation and renewals
install_lets_encrypt() {
    local cert_data=$1
    
    # Extract certificate information
    local domain_name=$(echo "$cert_data" | jq -r '.domain_name')
    local alt_names=$(echo "$cert_data" | jq -r '.alternative_names // ""')

    log_message "Installing Let's Encrypt certificate for domain: $domain_name"

    # Validate domain before proceeding
    if ! validate_domain "$domain_name"; then
        log_error "Invalid domain name format: $domain_name"
        return 1
    }

    # Install certificate with or without alternative names
    if [[ -n "$alt_names" ]]; then
        log_message "Including alternative names: $alt_names"
        clpctl lets-encrypt:install:certificate \
            --domainName="$domain_name" \
            --subjectAlternativeName="$alt_names"
    else
        clpctl lets-encrypt:install:certificate \
            --domainName="$domain_name"
    fi

    log_message "Let's Encrypt certificate installed successfully for $domain_name"
}

# Function to install a custom SSL certificate
# This handles certificates from other providers or self-signed certificates
install_custom_certificate() {
    local cert_data=$1
    
    # Extract certificate information
    local domain_name=$(echo "$cert_data" | jq -r '.domain_name')
    local private_key_path=$(echo "$cert_data" | jq -r '.private_key')
    local certificate_path=$(echo "$cert_data" | jq -r '.certificate')
    local chain_path=$(echo "$cert_data" | jq -r '.certificate_chain // ""')

    log_message "Installing custom certificate for domain: $domain_name"

    # Validate all required files exist
    if [[ ! -f "$private_key_path" ]]; then
        log_error "Private key file not found: $private_key_path"
        return 1
    fi
    if [[ ! -f "$certificate_path" ]]; then
        log_error "Certificate file not found: $certificate_path"
        return 1
    fi
    if [[ -n "$chain_path" && ! -f "$chain_path" ]]; then
        log_error "Certificate chain file not found: $chain_path"
        return 1
    fi

    # Install the certificate using CloudPanel's command
    if [[ -n "$chain_path" ]]; then
        clpctl site:install:certificate \
            --domainName="$domain_name" \
            --privateKey="$private_key_path" \
            --certificate="$certificate_path" \
            --certificateChain="$chain_path"
    else
        clpctl site:install:certificate \
            --domainName="$domain_name" \
            --privateKey="$private_key_path" \
            --certificate="$certificate_path"
    fi

    log_message "Custom certificate installed successfully for $domain_name"
}

# Function to renew all Let's Encrypt certificates
# This is typically run via cron job
renew_all_certificates() {
    log_message "Starting renewal of all Let's Encrypt certificates"

    # Renew all certificates using CloudPanel's command
    clpctl lets-encrypt:renew:certificates

    log_message "Certificate renewal completed successfully"
}

# Function to renew a specific domain's Let's Encrypt certificate
renew_domain_certificate() {
    local cert_data=$1
    local domain_name=$(echo "$cert_data" | jq -r '.domain_name')

    log_message "Renewing Let's Encrypt certificate for domain: $domain_name"

    # Validate domain before proceeding
    if ! validate_domain "$domain_name"; then
        log_error "Invalid domain name format: $domain_name"
        return 1
    }

    # Renew the specific domain's certificate
    clpctl lets-encrypt:renew:custom-domain:certificate \
        --domainName="$domain_name"

    log_message "Certificate renewed successfully for $domain_name"
}

# Function to validate a domain name format
validate_domain() {
    local domain=$1
    if [[ ! $domain =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$ ]]; then
        return 1
    fi
    return 0
}

# Main execution function that processes the operation
main() {
    OPERATION_ID=$2
    local operation=$1
    
    # Get operation data from database
    local operation_data=$(get_operation_data $OPERATION_ID)

    # Update operation status to processing
    update_operation_status $OPERATION_ID "processing"

    # Execute the requested operation
    case "$operation" in
        "install_lets_encrypt")
            install_lets_encrypt "$operation_data"
            ;;
        "install_custom")
            install_custom_certificate "$operation_data"
            ;;
        "renew_all")
            renew_all_certificates
            ;;
        "renew_domain")
            renew_domain_certificate "$operation_data"
            ;;
        *)
            echo "Usage: $0 {install_lets_encrypt|install_custom|renew_all|renew_domain} operation_id"
            exit 1
            ;;
    esac

    # Update operation status to completed
    update_operation_status $OPERATION_ID "completed"
}

# Execute main function with provided arguments
main "$@"