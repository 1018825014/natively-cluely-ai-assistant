#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-/srv/natively}"
OWNER="${2:-${SUDO_USER:-$USER}}"

sudo dnf update -y
sudo dnf install -y git nginx curl tar gzip
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
sudo npm install -g pm2

sudo mkdir -p "$APP_ROOT/app" "$APP_ROOT/data" "$APP_ROOT/logs"
sudo chown -R "$OWNER:$OWNER" "$APP_ROOT"

echo "Node version:"
node -v
echo "npm version:"
npm -v
echo "pm2 version:"
pm2 -v
echo "nginx version:"
nginx -v
