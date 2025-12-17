#!/bin/bash

###############################################################################
# LLM Performance Test Platform - Auto Update Script
#
# This script automatically updates the platform to the latest version
#
# Usage:
#   sudo ./update.sh                    # Update all components
#   sudo ./update.sh --backend-only     # Update backend only
#   sudo ./update.sh --frontend-only    # Update frontend only
#   sudo ./update.sh --check            # Check for updates without applying
#
# Can be scheduled via cron for automatic updates
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
INSTALL_DIR=${INSTALL_DIR:-$(cd "$(dirname "$0")" && pwd)}
DEPLOY_USER=${DEPLOY_USER:-$(stat -c '%U' "$INSTALL_DIR" 2>/dev/null || stat -f '%Su' "$INSTALL_DIR" 2>/dev/null)}
UPDATE_BACKEND=true
UPDATE_FRONTEND=true
CHECK_ONLY=false

# Logging
LOG_FILE="$INSTALL_DIR/logs/update.log"
mkdir -p "$INSTALL_DIR/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
    log "SUCCESS: $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1" >&2
    log "ERROR: $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
    log "WARNING: $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
    log "INFO: $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backend-only)
            UPDATE_FRONTEND=false
            shift
            ;;
        --frontend-only)
            UPDATE_BACKEND=false
            shift
            ;;
        --check)
            CHECK_ONLY=true
            shift
            ;;
        -h|--help)
            echo "Usage: sudo ./update.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --backend-only      Update backend only"
            echo "  --frontend-only     Update frontend only"
            echo "  --check            Check for updates without applying"
            echo "  -h, --help         Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

print_info "=========================================="
print_info "LLM Performance Test Platform - Auto Update"
print_info "=========================================="
print_info "Install Directory: $INSTALL_DIR"
print_info "Deploy User: $DEPLOY_USER"
log "Update started"

# Change to install directory
cd "$INSTALL_DIR"

# Check for updates
print_info "Checking for updates..."
sudo -u "$DEPLOY_USER" git fetch origin

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    print_status "Already up to date (commit: ${LOCAL_COMMIT:0:7})"
    log "No updates available"
    exit 0
fi

print_info "Updates available:"
print_info "  Current: ${LOCAL_COMMIT:0:7}"
print_info "  Latest:  ${REMOTE_COMMIT:0:7}"

# Show what changed
print_info "Changes:"
git log --oneline --decorate --color=always HEAD..origin/main | head -10

if [ "$CHECK_ONLY" = true ]; then
    print_info "Check-only mode: exiting without applying updates"
    exit 0
fi

echo ""
read -p "Apply these updates? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Update cancelled"
    log "Update cancelled by user"
    exit 0
fi

# Pull latest code
print_info "Pulling latest code..."
sudo -u "$DEPLOY_USER" git pull origin main
print_status "Code updated to ${REMOTE_COMMIT:0:7}"

# Update backend
if [ "$UPDATE_BACKEND" = true ]; then
    print_info "Updating backend..."

    cd "$INSTALL_DIR/llm-perf-platform"

    # Check if there are Python dependency changes
    if git diff --name-only "$LOCAL_COMMIT" "$REMOTE_COMMIT" | grep -q "pyproject.toml"; then
        print_info "Python dependencies changed, updating..."
        sudo -u "$DEPLOY_USER" bash -c "source .venv/bin/activate && pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple -q && uv pip install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple"
        print_status "Python dependencies updated"
    fi

    # Run database migrations
    print_info "Running database migrations..."
    sudo -u "$DEPLOY_USER" bash -c "source .venv/bin/activate && alembic upgrade head"
    print_status "Database migrations complete"

    # Restart backend service
    print_info "Restarting backend service..."
    systemctl restart llm-perf-backend.service
    sleep 1

    if systemctl is-active --quiet llm-perf-backend.service; then
        print_status "Backend service restarted successfully"
    else
        print_error "Backend service failed to start"
        print_info "Check logs: journalctl -u llm-perf-backend -n 50"
        log "Backend service failed to start after update"
        exit 1
    fi
fi

# Update frontend
if [ "$UPDATE_FRONTEND" = true ]; then
    print_info "Updating frontend..."

    cd "$INSTALL_DIR/frontend"

    # Check if there are frontend dependency changes
    if git diff --name-only "$LOCAL_COMMIT" "$REMOTE_COMMIT" | grep -q "package.json"; then
        print_info "Frontend dependencies changed, updating..."
        sudo -u "$DEPLOY_USER" pnpm install
        print_status "Frontend dependencies updated"
    fi

    # Check if there are frontend code changes
    if git diff --name-only "$LOCAL_COMMIT" "$REMOTE_COMMIT" | grep -q "^frontend/"; then
        print_info "Frontend code changed, rebuilding..."
        sudo -u "$DEPLOY_USER" bash -c 'pnpm vite build || pnpm build'
        print_status "Frontend rebuilt"
    fi
fi

print_status "=========================================="
print_status "Update completed successfully!"
print_status "=========================================="
log "Update completed successfully to commit ${REMOTE_COMMIT:0:7}"

# Show service status
if [ "$UPDATE_BACKEND" = true ]; then
    print_info "Backend service status:"
    systemctl status llm-perf-backend.service --no-pager -l | head -15
fi

exit 0
