# CloudPanel Scripts

This repository contains the operational scripts for CloudPanel API integration.
These scripts handle various system operations triggered by the CloudPanel API.

## Installation

```bash
git clone https://github.com/hhftechnology/cloudpanel-api/cloudpanel-scripts.git
cd cloudpanel-scripts
sudo ./install.sh
```

```plaintext
cloudpanel-scripts/
├── install.sh                      # Installation script
├── README.md                       # Repository documentation
├── .gitignore                     # Git ignore file
├── systemd/                       # Systemd service files
│   └── cloudpanel-queue.service   # Queue worker service
│
├── config/                        # Configuration files
│   ├── operation_types.conf       # Operation type mappings
│   └── thresholds.conf           # System thresholds configuration
│
├── core/                          # Core utility scripts
│   ├── database.sh               # Database operations
│   ├── logging.sh                # Logging utilities
│   └── validation.sh             # Input validation
│
├── scripts/
│   ├── orchestrator/             # Main orchestration scripts
│   │   ├── queue_worker.sh       # Main queue processor
│   │   └── status_monitor.sh     # Operation status monitor
│   │
│   ├── user/                     # User management scripts
│   │   └── manage_user.sh        # User operations handler
│   │
│   ├── sites/                    # Site management scripts
│   │   └── manage_site.sh        # Site operations handler
│   │
│   ├── databases/                # Database management scripts
│   │   └── manage_database.sh    # Database operations handler
│   │
│   ├── certificates/             # Certificate management scripts
│   │   └── manage_certificates.sh # Certificate operations handler
│   │
│   ├── maintenance/              # System maintenance scripts
│   │   └── system_maintenance.sh # Maintenance operations handler
│   │
│   └── monitoring/               # Monitoring scripts
│       └── system_monitor.sh     # System metrics collector
│
├── sql/                          # SQL schema files
│   ├── schema.sql               # Main database schema
│   └── migrations/              # Database migrations
│       └── 001_operations_table.sql
│
└── tests/                        # Test scripts
    ├── test_database.sh
    ├── test_sites.sh
    ├── test_user.sh
    └── test_monitoring.sh
```

## Structure

- `core/` - Core utility scripts
- `scripts/` - Operation handlers
- `config/` - Configuration files
- `systemd/` - System service files
- `sql/` - Database schema and migrations
- `tests/` - Test scripts

## Usage

The scripts are automatically triggered by the CloudPanel API through the queue
worker service. Manual operation is also possible:

```bash
# Execute a specific operation
/home/clp/scripts/orchestrator/queue_worker.sh

# Check service status
systemctl status cloudpanel-queue

# View logs
tail -f /home/clp/logs/orchestrator/queue.log
```

## Testing

Run the test suite:
```bash
cd tests
./run_tests.sh
```

## Monitoring

Monitor the queue worker:
```bash
systemctl status cloudpanel-queue
tail -f /home/clp/logs/orchestrator/queue.log
```

## License

MIT License