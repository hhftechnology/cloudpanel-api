#!/bin/bash
# install.sh

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
INSTALL_DIR="/home/clp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
   exit 1
fi

# Create necessary directories
log "Creating directory structure..."
mkdir -p "${INSTALL_DIR}/scripts"/{core,orchestrator,user,sites,databases,certificates,maintenance,monitoring}
mkdir -p "${INSTALL_DIR}/logs"/{operations,orchestrator}
mkdir -p "${INSTALL_DIR}/config"

# Copy scripts
log "Copying scripts..."
cp -r "${SCRIPT_DIR}/core/"* "${INSTALL_DIR}/scripts/core/"
cp -r "${SCRIPT_DIR}/scripts/"* "${INSTALL_DIR}/scripts/"
cp -r "${SCRIPT_DIR}/config/"* "${INSTALL_DIR}/config/"

# Set permissions
log "Setting permissions..."
chmod 750 "${INSTALL_DIR}/scripts" -R
chmod 640 "${INSTALL_DIR}/scripts/"*/*.sh
chmod 750 "${INSTALL_DIR}/logs" -R
chmod 640 "${INSTALL_DIR}/config/"*

# Install systemd service
log "Installing systemd service..."
cp "${SCRIPT_DIR}/systemd/cloudpanel-queue.service" /etc/systemd/system/
systemctl daemon-reload

# Initialize database if needed
log "Checking database schema..."
if [[ ! -f "${INSTALL_DIR}/htdocs/app/data/db.sq3" ]]; then
    sqlite3 "${INSTALL_DIR}/htdocs/app/data/db.sq3" < "${SCRIPT_DIR}/sql/schema.sql"
fi

# Start services
log "Starting services..."
systemctl enable cloudpanel-queue
systemctl start cloudpanel-queue

log "Installation completed successfully!"