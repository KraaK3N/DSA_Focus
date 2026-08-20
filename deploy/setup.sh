#!/bin/bash
# ─── DSA Focus Dashboard — VPS Deployment Script ───────────────────
# Run this on a fresh Ubuntu 22.04+ VPS
# Usage: bash deploy/setup.sh

set -e

echo "═══════════════════════════════════════════════"
echo " DSA Focus Dashboard — VPS Setup"
echo "═══════════════════════════════════════════════"

DOMAIN="${1:-yourdomain.me}"
APP_DIR="/var/www/dsa-focus"

# ─── 1. System updates ─────────────────────────
echo "→ Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ─── 2. Install Node.js 20 LTS ────────────────
echo "→ Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# ─── 3. Install PostgreSQL 16 ─────────────────
echo "→ Installing PostgreSQL 16..."
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
echo "→ Creating database..."
sudo -u postgres psql -c "CREATE USER dsafocus WITH PASSWORD 'changeme_strong_password';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE dsa_focus OWNER dsafocus;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE dsa_focus TO dsafocus;" 2>/dev/null || true

# ─── 4. Install Nginx ─────────────────────────
echo "→ Installing Nginx..."
sudo apt install -y nginx
sudo systemctl enable nginx

# ─── 5. Install PM2 ──────────────────────────
echo "→ Installing PM2..."
sudo npm install -g pm2

# ─── 6. Install Certbot ──────────────────────
echo "→ Installing Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# ─── 7. Clone / deploy app ───────────────────
echo "→ Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# If deploying from git:
# git clone https://github.com/yourusername/dsa-focus-dashboard.git $APP_DIR
# cd $APP_DIR

echo ""
echo "═══════════════════════════════════════════════"
echo " Manual Steps Required:"
echo "═══════════════════════════════════════════════"
echo ""
echo "1. Copy project files to: $APP_DIR"
echo ""
echo "2. Create .env file:"
echo "   cp $APP_DIR/server/.env.example $APP_DIR/server/.env"
echo "   # Edit with production values:"
echo "   # DATABASE_URL=postgresql://dsafocus:changeme_strong_password@localhost:5432/dsa_focus"
echo "   # JWT_SECRET=<generate with: openssl rand -hex 32>"
echo "   # GOOGLE_CLIENT_ID=<from Google Cloud Console>"
echo "   # GOOGLE_CLIENT_SECRET=<from Google Cloud Console>"
echo "   # GOOGLE_CALLBACK_URL=https://$DOMAIN/api/auth/google/callback"
echo "   # CLIENT_URL=https://$DOMAIN"
echo "   # NODE_ENV=production"
echo ""
echo "3. Install dependencies and build:"
echo "   cd $APP_DIR"
echo "   npm install"
echo "   cd server && npm install"
echo "   cd ../client && npm install && npm run build"
echo ""
echo "4. Run database migrations:"
echo "   cd $APP_DIR/server && npm run migrate"
echo "   npm run seed  # optional: creates test data"
echo ""
echo "5. Configure Nginx:"
echo "   sudo cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/dsa-focus"
echo "   sudo sed -i 's/yourdomain.me/$DOMAIN/g' /etc/nginx/sites-available/dsa-focus"
echo "   sudo ln -sf /etc/nginx/sites-available/dsa-focus /etc/nginx/sites-enabled/"
echo "   sudo rm -f /etc/nginx/sites-enabled/default"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "6. Get SSL certificate:"
echo "   sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "7. Start the app with PM2:"
echo "   cd $APP_DIR && pm2 start ecosystem.config.js --env production"
echo "   pm2 save"
echo "   pm2 startup  # follow the instructions it prints"
echo ""
echo "8. Set up PostgreSQL backups (add to crontab -e):"
echo "   0 3 * * * pg_dump -U dsafocus dsa_focus | gzip > /var/backups/dsa_focus_\$(date +\\%Y\\%m\\%d).sql.gz"
echo ""
echo "9. DNS: Point $DOMAIN A record to this server's IP"
echo ""
echo "═══════════════════════════════════════════════"
echo " Setup complete! Follow the manual steps above."
echo "═══════════════════════════════════════════════"
