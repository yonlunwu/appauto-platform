#!/bin/bash

###############################################################################
# LLM Performance Test Platform - One-Click Deployment Script
#
# This script automates the deployment process on Ubuntu servers
# It handles:
# - System dependencies installation
# - Python and Node.js environment setup
# - Database initialization
# - Backend and frontend build
# - Service configuration
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_USER=${DEPLOY_USER:-$(whoami)}
INSTALL_DIR=${INSTALL_DIR:-$(pwd)}
BACKEND_PORT=${BACKEND_PORT:-8000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
PYTHON_VERSION="3.11"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}LLM Performance Test Platform Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Deploy User: $DEPLOY_USER"
echo "Install Directory: $INSTALL_DIR"
echo "Backend Port: $BACKEND_PORT"
echo "Frontend Port: $FRONTEND_PORT"
echo ""

# Function to print status messages
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running on Ubuntu/Debian
if ! command -v apt-get &> /dev/null; then
    print_error "This script is designed for Ubuntu/Debian systems"
    exit 1
fi

print_status "Checking system requirements..."

# Update system packages
print_status "Updating system packages..."
sudo apt-get update

# Install system dependencies
print_status "Installing system dependencies..."
sudo apt-get install -y \
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
    build-essential

# Upgrade Node.js to latest LTS if needed
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_status "Upgrading Node.js to LTS version..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

print_status "Node.js version: $(node --version)"
print_status "npm version: $(npm --version)"
print_status "Python version: $(python3.11 --version)"

# Navigate to install directory
cd "$INSTALL_DIR"

# Setup Backend
print_status "Setting up backend..."
cd llm-perf-platform

# Configure appauto dependency path
print_status "Configuring appauto dependency..."
APPAUTO_PATH=${APPAUTO_PATH:-"$INSTALL_DIR/../appauto"}
APPAUTO_ABS_PATH=$(cd "$APPAUTO_PATH" 2>/dev/null && pwd || echo "")

if [ -z "$APPAUTO_ABS_PATH" ] || [ ! -d "$APPAUTO_ABS_PATH" ]; then
    print_warning "Appauto not found at $APPAUTO_PATH"
    print_warning "Please ensure appauto is available or set APPAUTO_PATH environment variable"
    print_warning "Example: APPAUTO_PATH=/path/to/appauto ./deploy.sh"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    print_status "Found appauto at: $APPAUTO_ABS_PATH"
    # Update pyproject.toml with correct appauto path
    if grep -q "file:///Users/ryanyang/work/approaching/code/appauto" pyproject.toml; then
        print_status "Updating appauto path in pyproject.toml..."
        sed -i.bak "s|file:///Users/ryanyang/work/approaching/code/appauto|file://$APPAUTO_ABS_PATH|g" pyproject.toml
        rm -f pyproject.toml.bak
    elif ! grep -q "appauto.*file://" pyproject.toml; then
        print_warning "appauto dependency not found in pyproject.toml, you may need to add it manually"
    fi
fi

# Create Python virtual environment
if [ ! -d ".venv" ]; then
    print_status "Creating Python virtual environment..."
    python3.11 -m venv .venv
fi

# Activate virtual environment and install dependencies
print_status "Installing Python dependencies..."
source .venv/bin/activate
pip install --upgrade pip
pip install -e .

# Initialize database
print_status "Initializing database..."
if [ ! -f "llm_perf_platform.db" ]; then
    alembic upgrade head
    print_status "Database initialized successfully"
else
    print_status "Database already exists, running migrations..."
    alembic upgrade head
fi

# Create necessary directories
mkdir -p logs
mkdir -p results

# Setup Frontend
print_status "Setting up frontend..."
cd ../frontend

# Install frontend dependencies
print_status "Installing frontend dependencies..."
npm install

# Build frontend for production
print_status "Building frontend..."
npm run build

print_status "Deployment preparation completed!"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Next Steps:${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "1. Configure environment variables (if needed):"
echo "   cp llm-perf-platform/.env.example llm-perf-platform/.env"
echo "   Edit .env file with your settings"
echo ""
echo "2. Setup systemd services (run as root):"
echo "   sudo ./setup-services.sh"
echo ""
echo "3. Configure nginx (run as root):"
echo "   sudo ./setup-nginx.sh"
echo ""
echo "4. Or start services manually:"
echo "   # Backend:"
echo "   cd llm-perf-platform"
echo "   source .venv/bin/activate"
echo "   uvicorn llm_perf_platform.main:app --host 0.0.0.0 --port $BACKEND_PORT"
echo ""
echo "   # Frontend (development):"
echo "   cd frontend"
echo "   npm run dev -- --host 0.0.0.0 --port $FRONTEND_PORT"
echo ""
echo "   # Frontend (production with nginx):"
echo "   Serve frontend/dist with nginx"
echo ""
