#!/bin/bash
# ─── DSA Focus Dashboard — Deploy/Update Script ───────────────────
# Run this after pushing new code to update the production server
# Usage: bash deploy/update.sh

set -e

APP_DIR="/var/www/dsa-focus"

echo "→ Pulling latest code..."
cd $APP_DIR
git pull origin main

echo "→ Installing server dependencies..."
cd $APP_DIR/server && npm install --production

echo "→ Installing client dependencies and building..."
cd $APP_DIR/client && npm install && npm run build

echo "→ Running database migrations..."
cd $APP_DIR/server && npm run migrate

echo "→ Restarting application..."
cd $APP_DIR && pm2 restart ecosystem.config.js --env production

echo "→ Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "✅ Deploy complete!"
echo "   Check status: pm2 status"
echo "   Check logs:   pm2 logs dsa-focus-api"
