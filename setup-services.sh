#!/bin/bash

###############################################################################
# Setup systemd services for LLM Performance Test Platform
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo ./setup-services.sh)${NC}"
    exit 1
fi

# Configuration
DEPLOY_USER=${DEPLOY_USER:-$SUDO_USER}
INSTALL_DIR=${INSTALL_DIR:-$(pwd)}
BACKEND_PORT=${BACKEND_PORT:-8000}

echo -e "${GREEN}Setting up systemd services...${NC}"
echo "Deploy User: $DEPLOY_USER"
echo "Install Directory: $INSTALL_DIR"

# Create backend service file
cat > /etc/systemd/system/llm-perf-backend.service <<EOF
[Unit]
Description=LLM Performance Test Platform - Backend API
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$INSTALL_DIR/llm-perf-platform
Environment="PATH=$INSTALL_DIR/llm-perf-platform/.venv/bin"
ExecStart=$INSTALL_DIR/llm-perf-platform/.venv/bin/uvicorn llm_perf_platform.main:app --host 0.0.0.0 --port $BACKEND_PORT --workers 4
Restart=always
RestartSec=10

# Logging
StandardOutput=append:$INSTALL_DIR/llm-perf-platform/logs/backend.log
StandardError=append:$INSTALL_DIR/llm-perf-platform/logs/backend-error.log

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}Created backend service file${NC}"

# Reload systemd
systemctl daemon-reload

# Enable and start backend service
systemctl enable llm-perf-backend.service
systemctl restart llm-perf-backend.service

echo -e "${GREEN}Backend service started${NC}"
echo ""
echo "Service status:"
systemctl status llm-perf-backend.service --no-pager
echo ""
echo -e "${GREEN}========================================${NC}"
echo "Service management commands:"
echo "  Start:   sudo systemctl start llm-perf-backend"
echo "  Stop:    sudo systemctl stop llm-perf-backend"
echo "  Restart: sudo systemctl restart llm-perf-backend"
echo "  Status:  sudo systemctl status llm-perf-backend"
echo "  Logs:    sudo journalctl -u llm-perf-backend -f"
echo ""
echo "Backend logs:"
echo "  Output: $INSTALL_DIR/llm-perf-platform/logs/backend.log"
echo "  Errors: $INSTALL_DIR/llm-perf-platform/logs/backend-error.log"
echo ""
