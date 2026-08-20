# Deployment Guide — DSA Focus Dashboard

## Prerequisites
- Ubuntu 22.04+ VPS (DigitalOcean, Linode, AWS EC2, etc.)
- A domain name (e.g., `yourdomain.me` from name.com)
- SSH access to the VPS
- Google Cloud Console project (for OAuth)

## Quick Start

```bash
# On your VPS:
bash deploy/setup.sh yourdomain.me
```

Then follow the printed manual steps.

## Architecture

```
Internet → Nginx (443/SSL) → Express API (port 3000)
                            → Static files (client/dist/)
```

- **Nginx**: SSL termination, static file serving, API reverse proxy
- **PM2**: Process management, auto-restart, clustering
- **PostgreSQL**: Database on same server
- **Let's Encrypt**: Free SSL certificates, auto-renewal via Certbot

## Environment Variables (Production)

```env
PORT=3000
NODE_ENV=production
CLIENT_URL=https://yourdomain.me
DATABASE_URL=postgresql://dsafocus:YOUR_PASSWORD@localhost:5432/dsa_focus
JWT_SECRET=GENERATE_WITH_openssl_rand_-hex_32
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=from-google-console
GOOGLE_CLIENT_SECRET=from-google-console
GOOGLE_CALLBACK_URL=https://yourdomain.me/api/auth/google/callback
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs: `https://yourdomain.me/api/auth/google/callback`
7. Copy the Client ID and Client Secret to your `.env`

## DNS Configuration

Point your domain to the VPS IP:

| Type | Name | Value |
|------|------|-------|
| A | @ | YOUR_VPS_IP |
| A | www | YOUR_VPS_IP |

DNS propagation takes 5-30 minutes.

## Maintenance

```bash
# Check app status
pm2 status

# View logs
pm2 logs dsa-focus-api

# Restart app
pm2 restart dsa-focus-api

# Database backup (manual)
pg_dump -U dsafocus dsa_focus | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip < backup_20260812.sql.gz | psql -U dsafocus dsa_focus

# Renew SSL (usually auto, but manual if needed)
sudo certbot renew

# Update app
bash deploy/update.sh
```

## Security Checklist

- [x] Rate limiting on API endpoints (express-rate-limit)
- [x] Security headers via Helmet
- [x] CORS restricted to production domain
- [x] Password hashing with bcrypt (cost 10)
- [x] JWT with expiration
- [x] SQL injection prevention (parameterized queries)
- [x] Input validation on all endpoints
- [x] HTTPS enforced via Nginx redirect
- [ ] Set up fail2ban for SSH
- [ ] Configure UFW firewall (allow 22, 80, 443 only)
- [ ] Set up automated backups
