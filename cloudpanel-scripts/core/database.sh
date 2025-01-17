#!/bin/bash
# /home/clp/scripts/core/database.sh

# Database configuration
DB_PATH="/home/clp/htdocs/app/data/db.sq3"

# Function to get operation data from database
get_operation_data() {
    local operation_id=$1
    
    sqlite3 "$DB_PATH" "
        SELECT json(data)
        FROM operations 
        WHERE id = $operation_id
    "
}

# Function to update operation status
update_operation_status() {
    local operation_id=$1
    local status=$2
    local error_message=${3:-""}
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    local sql=""
    if [[ "$status" == "processing" ]]; then
        sql="UPDATE operations 
             SET status = '$status', 
                 started_at = datetime('now') 
             WHERE id = $operation_id"
    elif [[ "$status" == "completed" ]]; then
        sql="UPDATE operations 
             SET status = '$status', 
                 completed_at = datetime('now') 
             WHERE id = $operation_id"
    elif [[ "$status" == "failed" ]]; then
        sql="UPDATE operations 
             SET status = '$status', 
                 completed_at = datetime('now'), 
                 error = '$error_message' 
             WHERE id = $operation_id"
    fi
    
    sqlite3 "$DB_PATH" "$sql"
}

# Function to store operation result
store_operation_result() {
    local operation_id=$1
    local result=$2
    
    sqlite3 "$DB_PATH" "
        UPDATE operations 
        SET result = json('$result') 
        WHERE id = $operation_id
    "
}

# Function to check if operation exists
check_operation_exists() {
    local operation_id=$1
    
    local count=$(sqlite3 "$DB_PATH" "
        SELECT COUNT(*) 
        FROM operations 
        WHERE id = $operation_id
    ")
    
    [[ $count -eq 1 ]]
}

# Function to get operation status
get_operation_status() {
    local operation_id=$1
    
    sqlite3 "$DB_PATH" "
        SELECT status 
        FROM operations 
        WHERE id = $operation_id
    "
}