#!/bin/bash
# /home/clp/scripts/orchestrator/queue_worker.sh

# Import common utilities
source /home/clp/scripts/core/database.sh
source /home/clp/scripts/core/logging.sh

# Configure logging
MAIN_LOG="/home/clp/logs/orchestrator/queue.log"
OPERATION_TYPES_FILE="/home/clp/scripts/orchestrator/operation_types.conf"

# Load operation type mappings
declare -A OPERATION_HANDLERS
while IFS='=' read -r operation_type handler_script; do
    OPERATION_HANDLERS["$operation_type"]="$handler_script"
done < "$OPERATION_TYPES_FILE"

log_message() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$MAIN_LOG"
    echo "$message"
}

process_operation() {
    local operation_id=$1
    local operation_type=$2
    
    # Get the handler script for this operation type
    local handler_script="${OPERATION_HANDLERS[$operation_type]}"
    
    if [[ -z "$handler_script" ]]; then
        log_message "ERROR: No handler found for operation type: $operation_type"
        update_operation_status "$operation_id" "failed" "No handler configured"
        return 1
    }
    
    log_message "Processing operation $operation_id of type $operation_type using $handler_script"
    
    # Execute the appropriate handler script
    if [[ -x "$handler_script" ]]; then
        "$handler_script" "$operation_type" "$operation_id"
        local result=$?
        
        if [[ $result -eq 0 ]]; then
            log_message "Operation $operation_id completed successfully"
        else
            log_message "Operation $operation_id failed with exit code $result"
        fi
        
        return $result
    else
        log_message "ERROR: Handler script not found or not executable: $handler_script"
        update_operation_status "$operation_id" "failed" "Handler script not available"
        return 1
    fi
}

# Main monitoring loop
monitor_operations() {
    log_message "Starting operation monitor"
    
    while true; do
        # Query for pending operations
        local pending_ops=$(sqlite3 /home/clp/htdocs/app/data/db.sq3 "
            SELECT id, type 
            FROM operations 
            WHERE status = 'pending' 
            ORDER BY created_at ASC
        ")
        
        if [[ -n "$pending_ops" ]]; then
            while IFS='|' read -r op_id op_type; do
                process_operation "$op_id" "$op_type"
            done <<< "$pending_ops"
        fi
        
        sleep 5
    done
}

# Start the monitor
monitor_operations