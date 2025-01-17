#!/bin/bash
# /home/clp/scripts/core/logging.sh

# Logging configuration
LOG_DIR="/home/clp/logs"
ERROR_LOG="$LOG_DIR/error.log"
DEBUG_LOG="$LOG_DIR/debug.log"

# Log levels
declare -A LOG_LEVELS=( 
    ["DEBUG"]=0
    ["INFO"]=1
    ["WARNING"]=2
    ["ERROR"]=3
    ["CRITICAL"]=4
)

# Current log level (can be changed at runtime)
CURRENT_LOG_LEVEL=${LOG_LEVELS["INFO"]}

# Function to log messages with timestamp and level
log() {
    local level=$1
    local message=$2
    local log_file=$3
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local script_name=$(basename "${BASH_SOURCE[2]}")
    local line_number=${BASH_LINENO[1]}
    
    echo "[$timestamp] [$level] [$script_name:$line_number] $message" >> "$log_file"
    
    # Also log errors to system log for monitoring
    if [[ "$level" == "ERROR" || "$level" == "CRITICAL" ]]; then
        logger -t "cloudpanel-scripts" "$level: $message"
    fi
}

# Function to log debug messages
log_debug() {
    if [[ ${LOG_LEVELS["DEBUG"]} -ge $CURRENT_LOG_LEVEL ]]; then
        log "DEBUG" "$1" "$DEBUG_LOG"
    fi
}

# Function to log info messages
log_info() {
    if [[ ${LOG_LEVELS["INFO"]} -ge $CURRENT_LOG_LEVEL ]]; then
        log "INFO" "$1" "$DEBUG_LOG"
    fi
}

# Function to log warning messages
log_warning() {
    if [[ ${LOG_LEVELS["WARNING"]} -ge $CURRENT_LOG_LEVEL ]]; then
        log "WARNING" "$1" "$ERROR_LOG"
    fi
}

# Function to log error messages
log_error() {
    if [[ ${LOG_LEVELS["ERROR"]} -ge $CURRENT_LOG_LEVEL ]]; then
        log "ERROR" "$1" "$ERROR_LOG"
    fi
}

# Function to log critical messages
log_critical() {
    if [[ ${LOG_LEVELS["CRITICAL"]} -ge $CURRENT_LOG_LEVEL ]]; then
        log "CRITICAL" "$1" "$ERROR_LOG"
    fi
}

# Function to set logging level
set_log_level() {
    local level=$1
    if [[ -n "${LOG_LEVELS[$level]}" ]]; then
        CURRENT_LOG_LEVEL=${LOG_LEVELS[$level]}
        log_info "Log level set to $level"
    else
        log_error "Invalid log level: $level"
    fi
}

# Function to rotate logs
rotate_logs() {
    local max_size=$((50*1024*1024))  # 50MB
    
    for log_file in "$ERROR_LOG" "$DEBUG_LOG"; do
        if [[ -f "$log_file" && $(stat -f%z "$log_file") -gt $max_size ]]; then
            mv "$log_file" "$log_file.$(date +%Y%m%d_%H%M%S)"
            gzip "$log_file.$(date +%Y%m%d_%H%M%S)"
        fi
    done
}

# Initialize logging
mkdir -p "$LOG_DIR"
chmod 750 "$LOG_DIR"