#!/bin/bash
# /home/clp/scripts/core/validation.sh

# Function to validate domain name
validate_domain() {
    local domain=$1
    local domain_regex="^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$"
    
    if [[ $domain =~ $domain_regex ]]; then
        return 0
    fi
    return 1
}

# Function to validate username
validate_username() {
    local username=$1
    local username_regex="^[a-z][a-z0-9_-]{2,31}$"
    
    if [[ $username =~ $username_regex ]]; then
        return 0
    fi
    return 1
}

# Function to validate email
validate_email() {
    local email=$1
    local email_regex="^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
    
    if [[ $email =~ $email_regex ]]; then
        return 0
    fi
    return 1
}

# Function to validate IP address (IPv4 and IPv6)
validate_ip() {
    local ip=$1
    
    # Check IPv4
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        IFS='.' read -r -a segments <<< "$ip"
        for segment in "${segments[@]}"; do
            if [[ $segment -lt 0 || $segment -gt 255 ]]; then
                return 1
            fi
        done
        return 0
    fi
    
    # Check IPv6
    if [[ $ip =~ ^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$ ]]; then
        return 0
    fi
    
    return 1
}

# Function to validate port number
validate_port() {
    local port=$1
    
    if [[ "$port" =~ ^[0-9]+$ && "$port" -ge 1 && "$port" -le 65535 ]]; then
        return 0
    fi
    return 1
}

# Function to validate path
validate_path() {
    local path=$1
    
    # Check if path contains any dangerous characters
    if [[ "$path" =~ [[:cntrl:]] || "$path" =~ [\\:\;\*\?\"\<\>\|] ]]; then
        return 1
    fi
    return 0
}

# Function to validate JSON
validate_json() {
    local json=$1
    
    if jq -e . >/dev/null 2>&1 <<< "$json"; then
        return 0
    fi
    return 1
}

# Function to validate SSL certificate
validate_certificate() {
    local cert_path=$1
    
    if ! openssl x509 -in "$cert_path" -noout -text >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

# Function to validate database name
validate_database_name() {
    local db_name=$1
    local db_regex="^[a-zA-Z0-9_]+$"
    
    if [[ $db_name =~ $db_regex && ${#db_name} -le 64 ]]; then
        return 0
    fi
    return 1
}

# Function to validate version number
validate_version() {
    local version=$1
    local version_regex="^[0-9]+\.[0-9]+(\.[0-9]+)?$"
    
    if [[ $version =~ $version_regex ]]; then
        return 0
    fi
    return 1
}