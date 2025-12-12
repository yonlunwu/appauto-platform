#!/bin/bash

###############################################################################
# Setup nginx configuration for LLM Performance Test Platform
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo ./setup-nginx.sh)${NC}"
    exit 1
fi

# Configuration
INSTALL_DIR=${INSTALL_DIR:-$(pwd)}
BACKEND_PORT=${BACKEND_PORT:-8000}
DOMAIN=${DOMAIN:-localhost}
SSL_ENABLED=${SSL_ENABLED:-false}

echo -e "${GREEN}Setting up nginx configuration...${NC}"
echo "Install Directory: $INSTALL_DIR"
echo "Backend Port: $BACKEND_PORT"
echo "Domain: $DOMAIN"
echo "SSL Enabled: $SSL_ENABLED"
echo ""

# Create nginx configuration
if [ "$SSL_ENABLED" = "true" ]; then
    cat > /etc/nginx/sites-available/llm-perf-platform <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL configuration
    ssl_certificate /etc/ssl/certs/llm-perf-platform.crt;
    ssl_certificate_key /etc/ssl/private/llm-perf-platform.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend - serve built static files
    location / {
        root $INSTALL_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
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

        # Increase timeouts for long-running requests
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Logs
    access_log /var/log/nginx/llm-perf-platform-access.log;
    error_log /var/log/nginx/llm-perf-platform-error.log;
}
EOF

    echo -e "${YELLOW}SSL is enabled. Please ensure SSL certificates are placed at:${NC}"
    echo "  Certificate: /etc/ssl/certs/llm-perf-platform.crt"
    echo "  Private Key: /etc/ssl/private/llm-perf-platform.key"
    echo ""
    echo "To generate self-signed certificates for testing:"
    echo "  sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
    echo "    -keyout /etc/ssl/private/llm-perf-platform.key \\"
    echo "    -out /etc/ssl/certs/llm-perf-platform.crt"
    echo ""
else
    cat > /etc/nginx/sites-available/llm-perf-platform <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend - serve built static files
    location / {
        root $INSTALL_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
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

        # Increase timeouts for long-running requests
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Logs
    access_log /var/log/nginx/llm-perf-platform-access.log;
    error_log /var/log/nginx/llm-perf-platform-error.log;
}
EOF
fi

# Enable the site
ln -sf /etc/nginx/sites-available/llm-perf-platform /etc/nginx/sites-enabled/

# Test nginx configuration
echo -e "${GREEN}Testing nginx configuration...${NC}"
nginx -t

# Reload nginx
echo -e "${GREEN}Reloading nginx...${NC}"
systemctl reload nginx

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Nginx configuration completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Your application should now be accessible at:"
if [ "$SSL_ENABLED" = "true" ]; then
    echo "  https://$DOMAIN"
else
    echo "  http://$DOMAIN"
fi
echo ""
echo "Nginx commands:"
echo "  Test config:  sudo nginx -t"
echo "  Reload:       sudo systemctl reload nginx"
echo "  Restart:      sudo systemctl restart nginx"
echo "  Status:       sudo systemctl status nginx"
echo "  Access logs:  sudo tail -f /var/log/nginx/llm-perf-platform-access.log"
echo "  Error logs:   sudo tail -f /var/log/nginx/llm-perf-platform-error.log"
echo ""
