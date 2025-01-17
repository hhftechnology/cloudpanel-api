# CloudPanel API Structure

```plaintext
cloudpanel-api/
├── .github/                      # GitHub specific files
│   └── workflows/                # GitHub Actions workflows
│       └── ci.yml
│
├── src/                         # Source code
│   ├── config/                  # Configuration files
│   │   ├── config.js           # Main configuration
│   │   └── database.js         # Database configuration
│   │
│   ├── controllers/            # Route controllers
│   │   ├── siteController.js
│   │   ├── databaseController.js
│   │   ├── userController.js
│   │   ├── certificateController.js
│   │   └── monitoringController.js
│   │
│   ├── middleware/             # Express middleware
│   │   ├── auth.js            # API key authentication
│   │   ├── validation.js      # Request validation
│   │   ├── security.js        # Security middleware
│   │   ├── logging.js         # Logging middleware
│   │   └── errorHandler.js    # Error handling
│   │
│   ├── models/                # Database models
│   │   ├── Site.js
│   │   ├── Database.js
│   │   ├── User.js
│   │   ├── Certificate.js
│   │   └── ApiKey.js
│   │
│   ├── routes/                # API routes
│   │   ├── v1/               # API version 1
│   │   │   ├── sites.js
│   │   │   ├── databases.js
│   │   │   ├── users.js
│   │   │   ├── certificates.js
│   │   │   └── monitoring.js
│   │   └── index.js          # Route aggregator
│   │
│   ├── services/             # Business logic
│   │   ├── siteService.js
│   │   ├── databaseService.js
│   │   ├── userService.js
│   │   └── monitoringService.js
│   │
│   ├── utils/                # Utility functions
│   │   ├── logger.js        # Logging utility
│   │   ├── validation.js    # Input validation
│   │   └── helpers.js       # Helper functions
│   │
│   ├── metrics/             # Monitoring metrics
│   │   ├── prometheus.js
│   │   └── collectors.js
│   │
│   └── app.js              # Express app setup
│
├── docker/                  # Docker related files
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── config/                 # Configuration files
│   ├── prometheus/
│   │   └── prometheus.yml
│   ├── grafana/
│   │   └── datasources.yml
│   └── loki/
│       └── loki-config.yml
│
├── cloudpanel-scripts/               # Utility scripts
│
├── tests/                # Test files
│   ├── unit/
│   │   ├── controllers/
│   │   ├── services/
│   │   └── models/
│   ├── integration/
│   └── setup.js
│
├── docs/                 # Documentation
│   ├── api/
│   │   └── swagger.yaml
│   ├── setup.md
│   └── monitoring.md
│
├── .env.example         # Example environment variables
├── .eslintrc.js        # ESLint configuration
├── .prettierrc         # Prettier configuration
├── .gitignore
├── package.json
└── README.md
```

## Key Explanations

### `/src`
Contains all source code for the API. Organized by feature and responsibility.

### `/src/controllers`
Handle HTTP requests and responses. They use services for business logic.

### `/src/services`
Contains business logic and database interactions.

### `/src/middleware`
Express middleware for authentication, logging, etc.

### `/src/models`
Database models and schema definitions.

### `/src/routes`
API route definitions, versioned in `/v1` directory.

### `/config`
External service configurations (Prometheus, Grafana, etc.).

### `/docker`
Docker-related files for containerization.

### `/tests`
Test files organized by type (unit, integration).

### `/docs`
API documentation and setup guides.

# CloudPanel API Documentation

## Authentication
All API requests require an API key passed in the header:
```
X-API-Key: cp_your_api_key_here
```

## Endpoints

### Sites

#### GET /api/v1/sites
Lists all sites.

Response:
```json
{
  "sites": [
    {
      "id": 1,
      "domainName": "example.com",
      "type": "php",
      "rootDirectory": "/home/user/htdocs/example.com"
    }
  ]
}
```

#### POST /api/v1/sites
Create a new site.

Request:
```json
{
  "domainName": "newsite.com",
  "type": "php",
  "rootDirectory": "/home/user/htdocs/newsite.com",
  "phpVersion": "8.2"
}
```

### Databases

#### GET /api/v1/databases
Lists all databases.

#### POST /api/v1/databases
Create a new database.

Request:
```json
{
  "name": "mydb",
  "siteId": 1,
  "user": {
    "username": "dbuser",
    "password": "securepass"
  }
}
```

### Users

#### GET /api/v1/users
Lists all users (requires admin API key).

#### POST /api/v1/users
Create a new user (requires admin API key).

Request:
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "role": "user"
}
```

## Rate Limiting
- 100 requests per 15 minutes per IP address
- Status 429 returned when exceeded

## Error Responses
```json
{
  "error": "Error message here",
  "code": "ERROR_CODE",
  "details": {} // Optional additional information
}
```

When someone makes a request to create a site through the API endpoint (e.g., POST /api/v1/sites), here's what happens:

First, the API route handler in `/src/routes/v1/sites.js` receives the request:

```javascript
router.post('/', async (req, res) => {
    try {
        // Create an operation record in the database
        const operationId = await db.run(`
            INSERT INTO operations (
                type, data, status, source, created_at
            ) VALUES (
                'site.create',
                ?, 
                'pending',
                'api',
                datetime('now')
            )
        `, [JSON.stringify(req.body)]);

        // Return immediate response with operation ID
        res.status(202).json({
            success: true,
            operation_id: operationId,
            message: 'Operation queued'
        });
    } catch (error) {
        // Error handling...
    }
});
```

Meanwhile, i have two systemd services running continuously:

1. The queue worker (`queue_worker.sh`), which checks for new operations:
```bash
while true; do
    # Query for pending operations
    pending_ops=$(sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        SELECT id, type 
        FROM operations 
        WHERE status = 'pending' 
        AND source = 'api'
        ORDER BY created_at ASC
    ")
    
    if [[ -n "$pending_ops" ]]; then
        # Process each operation...
    fi
    sleep 5
done
```

2. The status monitor (`status_monitor.sh`), which watches for problems:
```bash
while true; do
    # Check for stuck or timed out operations
    check_stuck_operations
    check_timed_out_operations
    sleep 60
done
```

So when a site creation request comes in:

1. API creates 'pending' operation in database
2. Queue worker sees new operation within 5 seconds
3. Queue worker runs appropriate script (e.g., `manage_site.sh create $operation_id`)
4. Script processes operation and updates status to 'completed' or 'failed'
5. Status monitor ensures nothing gets stuck

The client can poll the operation status endpoint to track progress:
```javascript
router.get('/operations/:id', async (req, res) => {
    const operation = await db.get(`
        SELECT status, error, result 
        FROM operations 
        WHERE id = ?
    `, [req.params.id]);
    
    res.json({
        success: true,
        data: operation
    });
});
```

This architecture gives us:
- Immediate API responses (non-blocking)
- Reliable operation processing
- Status tracking
- Error handling
- Separation from UI operations

Still working on
UI API Script triger challange. The key is to create a distinction layer betien UI and API operations in CloudPanel.

The first step is to modify our core operation tracking in the database. When an operation comes in via the API, it should be tagged as an API operation. I can do this by adding a `source` column to our operations table:

```sql
ALTER TABLE operations ADD COLUMN source VARCHAR(10) DEFAULT 'ui';
```

Then, I need to modify how our scripts check whether they should execute. the core database.sh script to include this check:

```bash
# Function to check if operation should be handled by scripts
should_handle_operation() {
    local operation_id=$1
    
    local source=$(sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        SELECT source 
        FROM operations 
        WHERE id = $operation_id
    ")
    
    # Only handle operations that came from the API
    [[ "$source" == "api" ]]
}
```

Now I can modify each of my handler scripts to use this check. For example, in manage_site.sh:

```bash
# Main execution function
main() {
    OPERATION_ID=$2
    local operation=$1
    
    # First check if i should handle this operation
    if ! should_handle_operation $OPERATION_ID; then
        log_message "Operation $OPERATION_ID is not an API operation - skipping"
        exit 0
    fi
    
    # Rest of the script continues as before...
```

For the API side, i need to ensure operations are properly tagged. When creating an operation through the API, i'll set the source:

```bash
create_operation() {
    local type=$1
    local data=$2
    
    sqlite3 /home/clp/htdocs/app/data/db.sq3 "
        INSERT INTO operations (
            type, data, status, source, created_at
        ) VALUES (
            '$type',
            '$data',
            'pending',
            'api',
            datetime('now')
        )
    "
}
```

This approach allows UI operations to continue using CloudPanel's built-in functionality while API operations go through our script system. This separation solves my chalanges:

1. No interference with existing UI operations
2. Clear tracking of operation sources
3. Easy to maintain and debug
4. No risk of duplicate operations

The queue worker and status monitor will naturally only process API operations since they'll inherit this check through the core database functions.