#!/bin/bash

###############################################################################
# LLM Performance Test Platform - One-Click Deployment Script
#
# This script performs complete deployment including:
# - System dependencies installation
# - Backend and frontend setup
# - Systemd service configuration
# - Nginx configuration
#
# Usage:
#   sudo ./one-click-deploy.sh --appauto-path /path/to/appauto [OPTIONS]
#
# Required:
#   --appauto-path PATH    Path to appauto directory
#
# Optional:
#   --domain DOMAIN        Domain name (default: localhost)
#   --ssl                  Enable SSL/HTTPS
#   --backend-port PORT    Backend port (default: 8000)
#   --skip-services        Skip systemd service setup
#   --skip-nginx           Skip nginx configuration
#   -h, --help            Show this help message
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
APPAUTO_PATH=""
DOMAIN="localhost"
SSL_ENABLED="false"
BACKEND_PORT="8000"
FRONTEND_PORT="5173"
PYTHON_VERSION="3.11"
SKIP_SERVICES="false"
SKIP_NGINX="false"
INSTALL_DIR=$(pwd)
DEPLOY_USER=${SUDO_USER:-$(whoami)}

# Function to print messages
print_banner() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Function to show help
show_help() {
    cat << EOF
LLM Performance Test Platform - One-Click Deployment

Usage: sudo ./one-click-deploy.sh --appauto-path /path/to/appauto [OPTIONS]

Required Arguments:
  --appauto-path PATH    Path to appauto directory

Optional Arguments:
  --domain DOMAIN        Domain name (default: localhost)
  --ssl                  Enable SSL/HTTPS (requires SSL certificates)
  --backend-port PORT    Backend port (default: 8000)
  --skip-services        Skip systemd service setup (manual start required)
  --skip-nginx           Skip nginx configuration (manual config required)
  -h, --help            Show this help message

Examples:
  # Basic deployment with appauto
  sudo ./one-click-deploy.sh --appauto-path /opt/appauto

  # Deployment with custom domain
  sudo ./one-click-deploy.sh --appauto-path /opt/appauto --domain example.com

  # Deployment with SSL
  sudo ./one-click-deploy.sh --appauto-path /opt/appauto --domain example.com --ssl

  # Deployment without services (for testing)
  sudo ./one-click-deploy.sh --appauto-path /opt/appauto --skip-services --skip-nginx

EOF
    exit 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --appauto-path)
            APPAUTO_PATH="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --ssl)
            SSL_ENABLED="true"
            shift
            ;;
        --backend-port)
            BACKEND_PORT="$2"
            shift 2
            ;;
        --skip-services)
            SKIP_SERVICES="true"
            shift
            ;;
        --skip-nginx)
            SKIP_NGINX="true"
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$APPAUTO_PATH" ]; then
    print_error "Missing required argument: --appauto-path"
    echo ""
    echo "Usage: sudo ./one-click-deploy.sh --appauto-path /path/to/appauto [OPTIONS]"
    echo "Use --help for more information"
    exit 1
fi

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Verify appauto path
APPAUTO_ABS_PATH=$(cd "$APPAUTO_PATH" 2>/dev/null && pwd || echo "")
if [ -z "$APPAUTO_ABS_PATH" ] || [ ! -d "$APPAUTO_ABS_PATH" ]; then
    print_error "Appauto directory not found: $APPAUTO_PATH"
    exit 1
fi

# Display configuration
print_banner "LLM Performance Test Platform"
echo ""
print_info "Configuration:"
echo "  Deploy User:    $DEPLOY_USER"
echo "  Install Dir:    $INSTALL_DIR"
echo "  Appauto Path:   $APPAUTO_ABS_PATH"
echo "  Domain:         $DOMAIN"
echo "  SSL Enabled:    $SSL_ENABLED"
echo "  Backend Port:   $BACKEND_PORT"
echo "  Skip Services:  $SKIP_SERVICES"
echo "  Skip Nginx:     $SKIP_NGINX"
echo ""
read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Deployment cancelled"
    exit 0
fi

# Start deployment
print_banner "Starting Deployment"

# Check if running on Ubuntu/Debian
if ! command -v apt-get &> /dev/null; then
    print_error "This script is designed for Ubuntu/Debian systems"
    exit 1
fi

# Update system packages
print_status "Updating system packages..."
apt-get update -qq

# Install system dependencies
print_status "Installing system dependencies..."
apt-get install -y -qq \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    nodejs \
    npm \
    nginx \
    sqlite3 \
    git \
    curl \
    build-essential > /dev/null 2>&1

# Upgrade Node.js to latest LTS if needed
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_status "Upgrading Node.js to LTS version..."
    print_info "Current version: $(node --version), upgrading to v20.x..."

    # Download and run NodeSource setup script
    if ! curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; then
        print_error "Failed to setup NodeSource repository"
        print_info "Please run manually:"
        echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -"
        echo "  sudo apt-get install -y nodejs"
        exit 1
    fi

    # Install Node.js
    if ! apt-get install -y nodejs; then
        print_error "Failed to install Node.js"
        print_info "Please run manually: sudo apt-get install -y nodejs"
        exit 1
    fi

    # Verify installation
    NEW_NODE_VERSION=$(node --version)
    print_status "Node.js upgraded successfully to $NEW_NODE_VERSION"
fi

# Install pnpm globally
print_status "Installing pnpm package manager..."
npm install -g pnpm > /dev/null 2>&1

print_info "Installed versions:"
echo "  Node.js: $(node --version)"
echo "  pnpm:    $(pnpm --version)"
echo "  Python:  $(python3.11 --version)"

# Setup Backend
print_status "Setting up backend..."
cd "$INSTALL_DIR/llm-perf-platform"

# Update pyproject.toml with correct appauto path
print_status "Configuring appauto dependency..."
if grep -q "file:///Users/ryanyang/work/approaching/code/appauto" pyproject.toml; then
    sed -i.bak "s|file:///Users/ryanyang/work/approaching/code/appauto|file://$APPAUTO_ABS_PATH|g" pyproject.toml
    rm -f pyproject.toml.bak
fi

# Create Python virtual environment
if [ ! -d ".venv" ]; then
    print_status "Creating Python virtual environment..."
    sudo -u "$DEPLOY_USER" python3.11 -m venv .venv
fi

# Install Python dependencies
print_status "Installing Python dependencies (this may take a few minutes)..."
sudo -u "$DEPLOY_USER" bash -c "source .venv/bin/activate && pip install --upgrade pip -q && pip install -e . -q"

# Initialize database
print_status "Initializing database..."
if [ ! -f "llm_perf_platform.db" ]; then
    sudo -u "$DEPLOY_USER" bash -c "source .venv/bin/activate && alembic upgrade head"
    print_status "Database initialized successfully"
else
    print_status "Database exists, running migrations..."
    sudo -u "$DEPLOY_USER" bash -c "source .venv/bin/activate && alembic upgrade head"
fi

# Create necessary directories
mkdir -p logs results
chown -R "$DEPLOY_USER":"$DEPLOY_USER" logs results

# Setup Frontend
print_status "Setting up frontend..."
cd "$INSTALL_DIR/frontend"

# Install frontend dependencies
print_status "Installing frontend dependencies (this may take a few minutes)..."
sudo -u "$DEPLOY_USER" pnpm install --silent 2>/dev/null

# Build frontend for production
print_status "Building frontend for production..."
sudo -u "$DEPLOY_USER" pnpm build --silent 2>/dev/null

# Setup systemd service (if not skipped)
if [ "$SKIP_SERVICES" = "false" ]; then
    print_status "Setting up systemd service..."

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

StandardOutput=append:$INSTALL_DIR/llm-perf-platform/logs/backend.log
StandardError=append:$INSTALL_DIR/llm-perf-platform/logs/backend-error.log

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    # Enable and start backend service
    systemctl enable llm-perf-backend.service > /dev/null 2>&1
    systemctl restart llm-perf-backend.service

    # Wait for service to start
    sleep 2

    if systemctl is-active --quiet llm-perf-backend.service; then
        print_status "Backend service started successfully"
    else
        print_error "Backend service failed to start"
        print_info "Check logs: journalctl -u llm-perf-backend -n 50"
        exit 1
    fi
else
    print_warning "Skipped systemd service setup"
fi

# Setup Nginx (if not skipped)
if [ "$SKIP_NGINX" = "false" ]; then
    print_status "Setting up Nginx..."

    # Create nginx configuration
    if [ "$SSL_ENABLED" = "true" ]; then
        cat > /etc/nginx/sites-available/llm-perf-platform <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/ssl/certs/llm-perf-platform.crt;
    ssl_certificate_key /etc/ssl/private/llm-perf-platform.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        root $INSTALL_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:$BACKEND_PORT/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    access_log /var/log/nginx/llm-perf-platform-access.log;
    error_log /var/log/nginx/llm-perf-platform-error.log;
}
EOF
    else
        cat > /etc/nginx/sites-available/llm-perf-platform <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        root $INSTALL_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:$BACKEND_PORT/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    access_log /var/log/nginx/llm-perf-platform-access.log;
    error_log /var/log/nginx/llm-perf-platform-error.log;
}
EOF
    fi

    # Enable the site
    ln -sf /etc/nginx/sites-available/llm-perf-platform /etc/nginx/sites-enabled/

    # Remove default site if it exists
    rm -f /etc/nginx/sites-enabled/default

    # Test nginx configuration
    if nginx -t > /dev/null 2>&1; then
        print_status "Nginx configuration is valid"
    else
        print_error "Nginx configuration test failed"
        nginx -t
        exit 1
    fi

    # Reload nginx
    systemctl reload nginx
    print_status "Nginx configured and reloaded successfully"

    if [ "$SSL_ENABLED" = "true" ]; then
        print_warning "SSL is enabled. Ensure SSL certificates are at:"
        echo "  Certificate: /etc/ssl/certs/llm-perf-platform.crt"
        echo "  Private Key: /etc/ssl/private/llm-perf-platform.key"
    fi
else
    print_warning "Skipped Nginx setup"
fi

# Deployment complete
print_banner "Deployment Complete!"
echo ""

if [ "$SKIP_SERVICES" = "false" ] && [ "$SKIP_NGINX" = "false" ]; then
    print_status "Your application is now running!"
    echo ""
    print_info "Access your application at:"
    if [ "$SSL_ENABLED" = "true" ]; then
        echo "  https://$DOMAIN"
    else
        echo "  http://$DOMAIN"
    fi
    echo ""
    print_info "Default admin credentials:"
    echo "  Email:    admin@example.com"
    echo "  Password: admin123"
    echo ""
    print_warning "IMPORTANT: Change the default admin password after first login!"
elif [ "$SKIP_SERVICES" = "true" ]; then
    print_info "To start the backend manually:"
    echo "  cd $INSTALL_DIR/llm-perf-platform"
    echo "  source .venv/bin/activate"
    echo "  uvicorn llm_perf_platform.main:app --host 0.0.0.0 --port $BACKEND_PORT"
elif [ "$SKIP_NGINX" = "true" ]; then
    print_info "Backend is running on port $BACKEND_PORT"
    print_info "You need to configure a web server to serve the frontend"
fi

echo ""
print_info "Service management:"
echo "  Status:  sudo systemctl status llm-perf-backend"
echo "  Restart: sudo systemctl restart llm-perf-backend"
echo "  Logs:    sudo journalctl -u llm-perf-backend -f"
echo ""
print_info "Backend logs:"
echo "  $INSTALL_DIR/llm-perf-platform/logs/backend.log"
echo "  $INSTALL_DIR/llm-perf-platform/logs/backend-error.log"
echo ""
print_info "Nginx logs:"
echo "  /var/log/nginx/llm-perf-platform-access.log"
echo "  /var/log/nginx/llm-perf-platform-error.log"
echo ""
print_status "Deployment completed successfully!"
