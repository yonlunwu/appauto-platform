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
APPAUTO_PATH=${APPAUTO_PATH:-""}

# Try to detect appauto path if not provided
if [ -z "$APPAUTO_PATH" ]; then
    # Check common locations
    for path in "../appauto" "../../appauto" "$HOME/work/approaching/code/appauto"; do
        if [ -d "$path" ]; then
            APPAUTO_PATH=$(cd "$path" && pwd)
            break
        fi
    done
fi

if [ -z "$APPAUTO_PATH" ]; then
    echo -e "${YELLOW}Warning: APPAUTO_PATH not set. Please provide it via environment variable:${NC}"
    echo "  APPAUTO_PATH=/path/to/appauto sudo ./setup-services.sh"
    echo ""
    read -p "Enter appauto path: " APPAUTO_PATH
    if [ -z "$APPAUTO_PATH" ] || [ ! -d "$APPAUTO_PATH" ]; then
        echo -e "${RED}Invalid appauto path${NC}"
        exit 1
    fi
    APPAUTO_PATH=$(cd "$APPAUTO_PATH" && pwd)
fi

echo -e "${GREEN}Setting up systemd services...${NC}"
echo "Deploy User: $DEPLOY_USER"
echo "Install Directory: $INSTALL_DIR"
echo "Appauto Path: $APPAUTO_PATH"

# Create backend service file
cat > /etc/systemd/system/llm-perf-backend.service <<EOF
[Unit]
Description=LLM Performance Test Platform - Backend API
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$INSTALL_DIR/llm-perf-platform
Environment="PATH=$INSTALL_DIR/llm-perf-platform/.venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="APPAUTO_SOURCE_PATH=$APPAUTO_PATH"
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
