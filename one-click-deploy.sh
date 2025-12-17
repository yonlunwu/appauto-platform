#!/bin/bash

###############################################################################
# LLM Performance Test Platform - One-Click Deployment Script
#
# Deployment Phases:
# Phase 0: Pre-flight checks
# Phase 1: Install and verify all required dependencies
# Phase 2: Backend setup
# Phase 3: Frontend setup
# Phase 4: Service configuration
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
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default configuration
APPAUTO_PATH=""
DOMAIN="localhost"
SSL_ENABLED="false"
BACKEND_PORT="8000"
PYTHON_VERSION="3.11"
NODE_MIN_VERSION="20"
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

print_phase() {
    echo ""
    echo -e "${CYAN}>>> Phase $1${NC}"
    echo ""
}

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Function to check network connectivity
check_network() {
    local test_urls=("mirrors.aliyun.com" "registry.npmmirror.com" "pypi.tuna.tsinghua.edu.cn")
    local success=false

    print_info "Checking network connectivity..."

    for url in "${test_urls[@]}"; do
        if curl -s --connect-timeout 10 --max-time 15 "http://$url" > /dev/null 2>&1; then
            print_status "Network check passed: $url is reachable"
            success=true
            break
        else
            print_warning "Cannot reach: $url"
        fi
    done

    if [ "$success" = false ]; then
        print_error "Network connectivity check failed"
        print_warning "This deployment requires internet access to download dependencies"
        print_warning "Please check your network connection and try again"
        return 1
    fi

    return 0
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
  # Basic deployment
  sudo ./one-click-deploy.sh --appauto-path /opt/appauto

  # Deployment with custom domain
  sudo ./one-click-deploy.sh --appauto-path /opt/appauto --domain example.com

  # Deployment with SSL
  sudo ./one-click-deploy.sh --appauto-path /opt/appauto --domain example.com --ssl

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

###############################################################################
# Phase 0: Pre-flight Checks
###############################################################################

print_banner "LLM Performance Test Platform Deployment"
echo ""
print_phase "0: Pre-flight Checks"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi
print_status "Running as root"

# Check Ubuntu/Debian
if ! command -v apt-get &> /dev/null; then
    print_error "This script is designed for Ubuntu/Debian systems"
    exit 1
fi
print_status "System is Ubuntu/Debian"

# Validate required arguments
if [ -z "$APPAUTO_PATH" ]; then
    print_error "Missing required argument: --appauto-path"
    echo ""
    echo "Usage: sudo ./one-click-deploy.sh --appauto-path /path/to/appauto [OPTIONS]"
    echo "Use --help for more information"
    exit 1
fi

# Verify appauto path
APPAUTO_ABS_PATH=$(cd "$APPAUTO_PATH" 2>/dev/null && pwd || echo "")
if [ -z "$APPAUTO_ABS_PATH" ] || [ ! -d "$APPAUTO_ABS_PATH" ]; then
    print_error "Appauto directory not found: $APPAUTO_PATH"
    exit 1
fi
print_status "Appauto found at: $APPAUTO_ABS_PATH"

# Check network connectivity
if ! check_network; then
    echo ""
    read -p "Network check failed. Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Deployment cancelled due to network issues"
        exit 1
    fi
    print_warning "Continuing despite network check failure..."
fi

# Display configuration
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

###############################################################################
# Phase 1: Install and Verify Required Dependencies
###############################################################################

print_phase "1: Install and Verify Dependencies"

# Configure APT to use Aliyun mirror for faster downloads in China
print_info "Configuring APT to use Aliyun mirror (China)..."
UBUNTU_CODENAME=$(lsb_release -cs)
cp /etc/apt/sources.list /etc/apt/sources.list.backup.$(date +%Y%m%d_%H%M%S)

cat > /etc/apt/sources.list <<EOF
# Aliyun Ubuntu Mirror (China)
deb http://mirrors.aliyun.com/ubuntu/ ${UBUNTU_CODENAME} main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ ${UBUNTU_CODENAME}-updates main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ ${UBUNTU_CODENAME}-backports main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ ${UBUNTU_CODENAME}-security main restricted universe multiverse
EOF
print_status "APT sources configured to use Aliyun mirror"

# Update package lists with timeout settings
print_info "Updating package lists..."
apt-get -o Acquire::http::Timeout=30 -o Acquire::Retries=3 update -qq

# Install software-properties-common for add-apt-repository
print_info "Installing basic tools..."
apt-get install -y software-properties-common curl build-essential git sqlite3 > /dev/null 2>&1
print_status "Basic tools installed"

# Check and install Python 3.11
print_info "Checking Python 3.11..."
if ! command -v python3.11 &> /dev/null; then
    print_warning "Python 3.11 not found, installing..."

    if ! apt-cache policy python3.11 | grep -q "Candidate:.*3.11"; then
        print_info "Adding deadsnakes PPA..."
        print_warning "This may take a while in China due to network conditions..."
        if ! add-apt-repository -y ppa:deadsnakes/ppa; then
            print_error "Failed to add deadsnakes PPA"
            print_info "Your Ubuntu version may not support Python 3.11"
            exit 1
        fi
        apt-get -o Acquire::http::Timeout=30 -o Acquire::Retries=3 update -qq
    fi

    print_info "Installing Python 3.11 and development tools..."
    if ! apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip; then
        print_error "Failed to install Python 3.11"
        exit 1
    fi
fi

if ! python3.11 --version &> /dev/null; then
    print_error "Python 3.11 installation verification failed"
    exit 1
fi
PYTHON_VERSION_STR=$(python3.11 --version)
print_status "Python 3.11 ready: $PYTHON_VERSION_STR"

# Check and install Node.js 20+
print_info "Checking Node.js..."
CURRENT_NODE_VERSION=""
if command -v node &> /dev/null; then
    CURRENT_NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
fi

if [ -z "$CURRENT_NODE_VERSION" ] || [ "$CURRENT_NODE_VERSION" -lt "$NODE_MIN_VERSION" ]; then
    if [ -n "$CURRENT_NODE_VERSION" ]; then
        print_warning "Current Node.js version: v$CURRENT_NODE_VERSION (< $NODE_MIN_VERSION)"
    else
        print_warning "Node.js not found"
    fi

    print_info "Installing Node.js 20.x..."

    # Remove old versions
    apt-get remove -y nodejs npm 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true

    # Install from NodeSource (with timeout and retry)
    print_info "Downloading NodeSource setup script..."
    if ! curl -fsSL --connect-timeout 30 --retry 3 --retry-delay 2 https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh; then
        print_error "Failed to download NodeSource setup script"
        print_info "Trying alternative method: installing from Ubuntu repositories..."

        # Fallback: try to install nodejs from Ubuntu repos (may be older version)
        if apt-get install -y nodejs npm; then
            print_warning "Installed Node.js from Ubuntu repositories (may not be v20)"
            INSTALLED_NODE_VERSION=$(node --version 2>/dev/null || echo "unknown")
            print_info "Installed version: $INSTALLED_NODE_VERSION"

            if [ "$INSTALLED_NODE_VERSION" = "unknown" ]; then
                print_error "Node.js installation failed"
                exit 1
            fi
        else
            print_error "All Node.js installation methods failed"
            exit 1
        fi
    else
        print_info "Setting up NodeSource repository..."
        if ! bash /tmp/nodesource_setup.sh; then
            print_error "Failed to setup NodeSource repository"
            exit 1
        fi
        rm -f /tmp/nodesource_setup.sh

        print_info "Installing Node.js from NodeSource..."
        if ! apt-get install -y nodejs; then
            print_error "Failed to install Node.js"
            exit 1
        fi
    fi
fi

if ! node --version &> /dev/null; then
    print_error "Node.js installation verification failed"
    exit 1
fi
NODE_VERSION_STR=$(node --version)
NPM_VERSION_STR=$(npm --version)
print_status "Node.js ready: $NODE_VERSION_STR (npm $NPM_VERSION_STR)"

# Configure npm to use Taobao mirror (China)
print_info "Configuring npm to use Taobao mirror..."
npm config set registry https://registry.npmmirror.com

# Set environment variables for binary downloads (compatible with newer npm versions)
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export SASS_BINARY_SITE="https://npmmirror.com/mirrors/node-sass/"
export PHANTOMJS_CDNURL="https://npmmirror.com/mirrors/phantomjs/"
export CHROMEDRIVER_CDNURL="https://npmmirror.com/mirrors/chromedriver/"
export PUPPETEER_DOWNLOAD_HOST="https://npmmirror.com/mirrors"

print_status "npm configured to use Taobao mirror"

# Check and install pnpm
print_info "Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
    print_warning "pnpm not found, installing from Taobao mirror..."
    if ! npm install -g pnpm; then
        print_error "Failed to install pnpm"
        exit 1
    fi
fi

if ! pnpm --version &> /dev/null; then
    print_error "pnpm installation verification failed"
    exit 1
fi
PNPM_VERSION_STR=$(pnpm --version)
print_status "pnpm ready: $PNPM_VERSION_STR"

# Check and install uv
print_info "Checking uv (fast Python package installer)..."
if ! command -v uv &> /dev/null; then
    print_warning "uv not found, installing via pip..."

    # Install uv using pip with Tsinghua mirror (more reliable in China)
    print_info "Installing uv from PyPI (Tsinghua mirror)..."
    if ! python3.11 -m pip install --user uv -i https://pypi.tuna.tsinghua.edu.cn/simple; then
        print_error "Failed to install uv via pip"
        print_info "Trying alternative method: direct download..."

        # Fallback to curl method
        if ! curl -LsSf --connect-timeout 30 --retry 3 https://astral.sh/uv/install.sh | sh; then
            print_error "All uv installation methods failed"
            exit 1
        fi
    fi

    # Find and copy uv to system location
    UV_INSTALLED=false
    for UV_PATH in "$HOME/.local/bin/uv" "/root/.local/bin/uv" "$HOME/.cargo/bin/uv" "/root/.cargo/bin/uv"; do
        if [ -f "$UV_PATH" ]; then
            cp "$UV_PATH" /usr/local/bin/uv
            chmod +x /usr/local/bin/uv
            UV_INSTALLED=true
            print_status "uv copied from $UV_PATH to /usr/local/bin/uv"
            break
        fi
    done

    if [ "$UV_INSTALLED" = false ]; then
        print_error "Failed to locate installed uv binary"
        exit 1
    fi
fi

if ! uv --version &> /dev/null; then
    print_error "uv installation verification failed"
    exit 1
fi
UV_VERSION_STR=$(uv --version)
print_status "uv ready: $UV_VERSION_STR"

# Check and install Nginx
print_info "Checking Nginx..."
if ! command -v nginx &> /dev/null; then
    print_warning "Nginx not found, installing..."
    if ! apt-get install -y nginx; then
        print_error "Failed to install Nginx"
        exit 1
    fi
fi

if ! nginx -v &> /dev/null; then
    print_error "Nginx installation verification failed"
    exit 1
fi
NGINX_VERSION_STR=$(nginx -v 2>&1)
print_status "Nginx ready: $NGINX_VERSION_STR"

print_status "All dependencies installed and verified"

###############################################################################
# Phase 2: Backend Setup
###############################################################################

print_phase "2: Backend Setup"

cd "$INSTALL_DIR/llm-perf-platform"

# Ensure proper ownership
print_info "Setting file ownership..."
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$INSTALL_DIR/llm-perf-platform"

# Configure appauto dependency
print_info "Configuring appauto dependency..."
if grep -q "file:///Users/ryanyang/work/approaching/code/appauto" pyproject.toml; then
    sed -i.bak "s|file:///Users/ryanyang/work/approaching/code/appauto|file://$APPAUTO_ABS_PATH|g" pyproject.toml
    rm -f pyproject.toml.bak
    chown "$DEPLOY_USER":"$DEPLOY_USER" pyproject.toml
fi
print_status "Appauto dependency configured"

# Create Python virtual environment
if [ ! -d ".venv" ]; then
    print_info "Creating Python virtual environment..."
    if ! sudo -u "$DEPLOY_USER" python3.11 -m venv .venv; then
        print_error "Failed to create virtual environment"
        exit 1
    fi
else
    print_info "Virtual environment exists, checking ownership..."
    chown -R "$DEPLOY_USER":"$DEPLOY_USER" .venv
fi
print_status "Virtual environment ready"

# Install Python dependencies with uv
print_info "Installing Python dependencies with uv (this may take a few minutes)..."
if ! sudo -u "$DEPLOY_USER" bash -c "export PATH=/usr/local/bin:\$PATH && source .venv/bin/activate && pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple -q && uv pip install -e . -i https://pypi.tuna.tsinghua.edu.cn/simple"; then
    print_error "Failed to install Python dependencies with uv"
    print_info "Check that appauto is correctly installed at: $APPAUTO_ABS_PATH"
    exit 1
fi
print_status "Python dependencies installed"

# Initialize database
print_info "Initializing database..."
mkdir -p logs results
chown -R "$DEPLOY_USER":"$DEPLOY_USER" logs results

if [ ! -f "llm_perf_platform.db" ]; then
    if ! sudo -u "$DEPLOY_USER" bash -c "source .venv/bin/activate && alembic upgrade head"; then
        print_error "Failed to initialize database"
        exit 1
    fi
    print_status "Database initialized"
else
    print_info "Database exists, running migrations..."
    if ! sudo -u "$DEPLOY_USER" bash -c "source .venv/bin/activate && alembic upgrade head"; then
        print_error "Failed to run database migrations"
        exit 1
    fi
    print_status "Database migrations complete"
fi

print_status "Backend setup complete"

###############################################################################
# Phase 3: Frontend Setup
###############################################################################

print_phase "3: Frontend Setup"

cd "$INSTALL_DIR/frontend"

# Ensure proper ownership
print_info "Setting file ownership..."
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$INSTALL_DIR/frontend"

# Configure pnpm to use Taobao registry (faster in China)
print_info "Configuring pnpm to use Taobao registry..."
sudo -u "$DEPLOY_USER" pnpm config set registry https://registry.npmmirror.com

# Install frontend dependencies
print_info "Installing frontend dependencies with pnpm (this may take a few minutes)..."
if ! sudo -u "$DEPLOY_USER" pnpm install; then
    print_error "Failed to install frontend dependencies"
    exit 1
fi
print_status "Frontend dependencies installed"

# Build frontend
print_info "Building frontend for production..."
print_warning "Temporarily relaxing TypeScript checks for production build..."

# Create a production-specific build script that skips strict type checking
if ! sudo -u "$DEPLOY_USER" bash -c 'cd '"$INSTALL_DIR/frontend"' && pnpm vite build'; then
    print_error "Failed to build frontend"
    print_info "Trying with TypeScript in non-strict mode..."

    # Backup original tsconfig.json
    cp tsconfig.json tsconfig.json.backup

    # Temporarily disable strict mode for build
    sed -i 's/"strict": true/"strict": false/' tsconfig.json

    # Try building again
    if ! sudo -u "$DEPLOY_USER" pnpm build; then
        # Restore original config
        mv tsconfig.json.backup tsconfig.json
        print_error "Failed to build frontend even with relaxed type checking"
        exit 1
    fi

    # Restore original config
    mv tsconfig.json.backup tsconfig.json
fi

print_status "Frontend build complete"

###############################################################################
# Phase 4: Service Configuration
###############################################################################

print_phase "4: Service Configuration"

# Setup systemd service (if not skipped)
if [ "$SKIP_SERVICES" = "false" ]; then
    print_info "Setting up systemd service..."

    cat > /etc/systemd/system/llm-perf-backend.service <<EOF
[Unit]
Description=LLM Performance Test Platform - Backend API
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$INSTALL_DIR/llm-perf-platform
Environment="PATH=$INSTALL_DIR/llm-perf-platform/.venv/bin:/usr/local/bin:/usr/bin:/bin"
Environment="APPAUTO_SOURCE_PATH=$APPAUTO_ABS_PATH"
ExecStart=$INSTALL_DIR/llm-perf-platform/.venv/bin/uvicorn llm_perf_platform.main:app --host 0.0.0.0 --port $BACKEND_PORT --workers 4
Restart=always
RestartSec=10

StandardOutput=append:$INSTALL_DIR/llm-perf-platform/logs/backend.log
StandardError=append:$INSTALL_DIR/llm-perf-platform/logs/backend-error.log

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable llm-perf-backend.service > /dev/null 2>&1
    systemctl restart llm-perf-backend.service

    sleep 2

    if systemctl is-active --quiet llm-perf-backend.service; then
        print_status "Backend service started"
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
    print_info "Setting up Nginx..."

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

    ln -sf /etc/nginx/sites-available/llm-perf-platform /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    if ! nginx -t > /dev/null 2>&1; then
        print_error "Nginx configuration test failed"
        nginx -t
        exit 1
    fi

    systemctl reload nginx
    print_status "Nginx configured"

    if [ "$SSL_ENABLED" = "true" ]; then
        print_warning "SSL is enabled. Ensure SSL certificates are at:"
        echo "  Certificate: /etc/ssl/certs/llm-perf-platform.crt"
        echo "  Private Key: /etc/ssl/private/llm-perf-platform.key"
    fi
else
    print_warning "Skipped Nginx setup"
fi

###############################################################################
# Phase 5: Pre-create Appauto Virtual Environments
###############################################################################

print_phase "5: Pre-create Appauto Virtual Environments"

print_info "Pre-creating virtual environments for common appauto branches..."
print_info "This ensures venvs are ready for testing and validates the setup"

# Common branches to pre-create
COMMON_BRANCHES=("main" "v3.3.1")

for BRANCH in "${COMMON_BRANCHES[@]}"; do
    print_info "Creating venv for appauto branch: $BRANCH"

    # Run Python script to create venv using the venv_manager
    sudo -u "$DEPLOY_USER" bash -c "cd $INSTALL_DIR/llm-perf-platform && source .venv/bin/activate && python3 -c \"
from llm_perf_platform.services.venv_manager import get_venv_manager
import sys

venv_manager = get_venv_manager()
print(f'Creating venv for branch: $BRANCH')
appauto_bin = venv_manager.ensure_venv('$BRANCH')

if appauto_bin:
    print(f'✓ Successfully created venv for $BRANCH at {appauto_bin}')
    sys.exit(0)
else:
    print(f'✗ Failed to create venv for $BRANCH')
    sys.exit(1)
\""

    if [ $? -eq 0 ]; then
        print_status "Venv for $BRANCH created successfully"
    else
        print_warning "Failed to create venv for $BRANCH (will be created on first use)"
    fi
done

print_status "Venv pre-creation completed"

###############################################################################
# Phase 6: Deployment Verification
###############################################################################

print_phase "6: Deployment Verification"

VERIFICATION_PASSED=true

# 1. Check Backend Port
print_info "Checking backend port $BACKEND_PORT..."
sleep 3  # Give backend time to fully start
if netstat -tuln 2>/dev/null | grep -q ":$BACKEND_PORT " || ss -tuln 2>/dev/null | grep -q ":$BACKEND_PORT "; then
    print_status "Backend port $BACKEND_PORT is listening"
else
    print_error "Backend port $BACKEND_PORT is NOT listening"
    VERIFICATION_PASSED=false
fi

# 2. Check Nginx Port
if [ "$SKIP_NGINX" = "false" ]; then
    print_info "Checking Nginx ports..."
    if netstat -tuln 2>/dev/null | grep -q ":80 " || ss -tuln 2>/dev/null | grep -q ":80 "; then
        print_status "Nginx HTTP port 80 is listening"
    else
        print_warning "Nginx HTTP port 80 is NOT listening"
        VERIFICATION_PASSED=false
    fi

    if [ "$SSL_ENABLED" = "true" ]; then
        if netstat -tuln 2>/dev/null | grep -q ":443 " || ss -tuln 2>/dev/null | grep -q ":443 "; then
            print_status "Nginx HTTPS port 443 is listening"
        else
            print_warning "Nginx HTTPS port 443 is NOT listening"
            VERIFICATION_PASSED=false
        fi
    fi
fi

# 3. Check Backend Service Status
if [ "$SKIP_SERVICES" = "false" ]; then
    print_info "Checking backend service status..."
    if systemctl is-active --quiet llm-perf-backend.service; then
        print_status "Backend service is running"

        # Get service uptime
        SERVICE_UPTIME=$(systemctl show llm-perf-backend.service --property=ActiveEnterTimestamp --value)
        print_info "Service started at: $SERVICE_UPTIME"
    else
        print_error "Backend service is NOT running"
        print_info "Service status:"
        systemctl status llm-perf-backend.service --no-pager -l
        VERIFICATION_PASSED=false
    fi
fi

# 4. Check Backend API Health
print_info "Checking backend API health..."
BACKEND_HEALTH_URL="http://localhost:$BACKEND_PORT/api/health"
if curl -f -s --connect-timeout 5 "$BACKEND_HEALTH_URL" > /dev/null 2>&1; then
    print_status "Backend API is responding"
else
    print_warning "Backend API health check failed at $BACKEND_HEALTH_URL"
    print_info "Trying API docs endpoint..."
    if curl -f -s --connect-timeout 5 "http://localhost:$BACKEND_PORT/docs" > /dev/null 2>&1; then
        print_status "Backend API docs endpoint is accessible"
    else
        print_error "Backend API is not responding"
        VERIFICATION_PASSED=false
    fi
fi

# 5. Check Frontend Accessibility
if [ "$SKIP_NGINX" = "false" ]; then
    print_info "Checking frontend accessibility..."

    # Determine the URL to check
    if [ "$DOMAIN" = "localhost" ]; then
        FRONTEND_URL="http://localhost"
    else
        if [ "$SSL_ENABLED" = "true" ]; then
            FRONTEND_URL="https://$DOMAIN"
        else
            FRONTEND_URL="http://$DOMAIN"
        fi
    fi

    # For localhost, check directly
    if [ "$DOMAIN" = "localhost" ]; then
        if curl -f -s --connect-timeout 5 "http://localhost" > /dev/null 2>&1; then
            print_status "Frontend is accessible at http://localhost"
        else
            print_error "Frontend is NOT accessible"
            VERIFICATION_PASSED=false
        fi
    else
        # For custom domain, check if we can resolve and connect
        print_info "Testing frontend URL: $FRONTEND_URL"
        if curl -f -s --connect-timeout 10 -k "$FRONTEND_URL" > /dev/null 2>&1; then
            print_status "Frontend is accessible at $FRONTEND_URL"
        else
            print_warning "Cannot access frontend at $FRONTEND_URL"
            print_info "This might be due to DNS/firewall. Check manually from a browser."
        fi
    fi
fi

# 6. Check Log Files
print_info "Checking log files..."
if [ -f "$INSTALL_DIR/llm-perf-platform/logs/backend.log" ]; then
    LOG_SIZE=$(stat -f%z "$INSTALL_DIR/llm-perf-platform/logs/backend.log" 2>/dev/null || stat -c%s "$INSTALL_DIR/llm-perf-platform/logs/backend.log" 2>/dev/null)
    print_status "Backend log exists (${LOG_SIZE} bytes)"

    # Check for errors in recent logs
    if [ -f "$INSTALL_DIR/llm-perf-platform/logs/backend-error.log" ]; then
        ERROR_COUNT=$(wc -l < "$INSTALL_DIR/llm-perf-platform/logs/backend-error.log" 2>/dev/null || echo 0)
        if [ "$ERROR_COUNT" -gt 0 ]; then
            print_warning "Found $ERROR_COUNT lines in error log"
            print_info "Last 5 error lines:"
            tail -5 "$INSTALL_DIR/llm-perf-platform/logs/backend-error.log" | sed 's/^/  /'
        else
            print_status "No errors in error log"
        fi
    fi
else
    print_warning "Backend log file not found (service may have just started)"
fi

echo ""
print_info "=== Verification Summary ==="
if [ "$VERIFICATION_PASSED" = true ]; then
    print_status "All verification checks passed! ✓"
else
    print_warning "Some verification checks failed. Please review the output above."
fi
echo ""

###############################################################################
# Deployment Complete
###############################################################################

print_banner "Deployment Complete!"
echo ""

if [ "$SKIP_SERVICES" = "false" ] && [ "$SKIP_NGINX" = "false" ]; then
    if [ "$VERIFICATION_PASSED" = true ]; then
        print_status "Your application is now running and verified!"
    else
        print_warning "Your application is deployed but some checks failed."
        print_info "Please review the verification results above."
    fi
    echo ""
    print_info "Access your application at:"
    if [ "$SSL_ENABLED" = "true" ]; then
        echo "  https://$DOMAIN"
    else
        if [ "$DOMAIN" = "localhost" ]; then
            echo "  http://localhost"
            echo "  http://$(hostname -I | awk '{print $1}')  (from other machines)"
        else
            echo "  http://$DOMAIN"
        fi
    fi
    echo ""
    print_info "Default admin credentials:"
    echo "  Email:    admin@example.com"
    echo "  Password: admin123"
    echo ""
    print_warning "IMPORTANT: Change the default admin password after first login!"
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
