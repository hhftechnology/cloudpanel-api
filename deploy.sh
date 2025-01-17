#!/bin/bash
# deploy.sh

# Configuration
APP_USER="clp"
APP_DIR="/home/clp/api"
BACKUP_DIR="/home/clp/backups/api"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup of current deployment
echo "Creating backup of current deployment..."
if [ -d "$APP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    tar -czf "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz" -C "$APP_DIR" .
fi

# Create application directory structure
echo "Creating directory structure..."
mkdir -p "$APP_DIR"/{config,logs,scripts}

# Install Node.js dependencies
echo "Installing dependencies..."
cd "$APP_DIR"
npm install --production

# Copy configuration files
echo "Copying configuration files..."
cp config/* "$APP_DIR/config/"

# Set up environment variables
echo "Setting up environment..."
cp .env.example .env

# Set up systemd service
echo "Setting up systemd service..."
cp systemd/cloudpanel-api.service /etc/systemd/system/
systemctl daemon-reload

# Set up log rotation
echo "Setting up log rotation..."
cp logrotate/cloudpanel-api /etc/logrotate.d/

# Set correct permissions
echo "Setting permissions..."
chown -R $APP_USER:$APP_USER "$APP_DIR"
chmod -R 750 "$APP_DIR"
chmod -R 640 "$APP_DIR"/config/*
chmod -R 660 "$APP_DIR"/logs

# Start services
echo "Starting services..."
systemctl enable cloudpanel-api
systemctl start cloudpanel-api
systemctl enable cloudpanel-queue
systemctl start cloudpanel-queue

echo "Deployment completed successfully!"