#!/usr/bin/env bash
set -euo pipefail

SERVER_NAME="${1:-101.43.20.2}"
UPSTREAM_HOST="${2:-127.0.0.1}"
UPSTREAM_PORT="${3:-8787}"
CONFIG_PATH="/etc/nginx/conf.d/natively-license-lite.conf"

sudo tee "$CONFIG_PATH" > /dev/null <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    location / {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "Nginx reverse proxy configured for ${SERVER_NAME} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}"
