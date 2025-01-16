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
├── scripts/               # Utility scripts
│   ├── setup.sh
│   └── backup.sh
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