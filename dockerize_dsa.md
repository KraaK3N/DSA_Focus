# 🐳 Complete Dockerization Guide for DSA Focus Dashboard

A comprehensive, production-ready guide to containerizing the **DSA Focus Dashboard** for both seamless local development and robust deployment on a cloud VPS (Virtual Private Server).

---

## 📑 Table of Contents

1. [Why Dockerize? Core Benefits & Motivations](#1-why-dockerize-core-benefits--motivations)
   - [Local Development Benefits](#local-development-benefits)
   - [The PostgreSQL Advantage (No Local Install Needed)](#the-postgresql-advantage-no-local-install-needed)
   - [Why This Prepares You for VPS Hosting](#why-this-prepares-you-for-vps-hosting)
2. [Architecture Overview](#2-architecture-overview)
3. [Required Docker Configurations & Files](#3-required-docker-configurations--files)
   - [3.1. `.dockerignore` (Root, Client, Server)](#31-dockerignore)
   - [3.2. Server Dockerfile (`server/Dockerfile`)](#32-server-dockerfile)
   - [3.3. Client Dockerfile (`client/Dockerfile`)](#33-client-dockerfile)
   - [3.4. Local Development Compose (`docker-compose.yml`)](#34-local-development-compose-docker-composeyml)
   - [3.5. Production Compose (`docker-compose.prod.yml`)](#35-production-compose-docker-composeprodyml)
   - [3.6. Environment File (`.env.example`)](#36-environment-file)
4. [Step-by-Step Local Setup & Execution](#4-step-by-step-local-setup--execution)
5. [Database Management & Migration Workflow](#5-database-management--migration-workflow)
   - [Running Migrations & Seeds](#running-migrations--seeds)
   - [Connecting via GUI Clients (DBeaver, TablePlus, VS Code)](#connecting-via-gui-clients)
   - [Backups (`pg_dump`) & Restores](#backups-pgdump--restores)
   - [Migrating from Legacy SQLite to Postgres Container](#migrating-from-legacy-sqlite-to-postgres-container)
6. [Roadmap to Production VPS Hosting](#6-roadmap-to-production-vps-hosting)
   - [VPS Initial Setup & Docker Installation](#vps-initial-setup--docker-installation)
   - [Domain & SSL/TLS Configuration](#domain--ssltls-configuration)
   - [Zero-Downtime Update Scripts](#zero-downtime-update-scripts)
   - [Automated Database Backups (Cron + S3/Local)](#automated-database-backups)
7. [Essential Docker Cheat Sheet](#7-essential-docker-cheat-sheet)

---

## 1. Why Dockerize? Core Benefits & Motivations

### Local Development Benefits
* **One-Command Bootstrapping**: Instead of opening 3 terminal tabs for PostgreSQL daemon, Express server, and Vite dev client, running `docker compose up` spins up your entire distributed system in seconds.
* **Hermetic Environment Isolation**: No need to worry about mismatched Node.js versions, globally installed packages, OS-specific build dependencies (e.g. `bcrypt` C++ compilation bindings), or leftover background daemons.
* **Instant Teardown & Reset**: You can test edge-case database states, corrupt or wipe test data, and spin up a fresh pristine database with `docker compose down -v && docker compose up`.

### The PostgreSQL Advantage (No Local Install Needed)
Since this project uses PostgreSQL for production and multi-user authentication:
* **Zero Host Pollution**: You do **not** need to install PostgreSQL binaries, configure system users (`postgres`), manage Linux `systemd` services, or configure `/etc/postgresql/pg_hba.conf` on your machine.
* **Version Guarantee**: You run the exact pinned version (`postgres:16-alpine`) that matches your production server.
* **Isolated Port Binding**: It runs inside its own container network. If you ever install another database locally on port `5432`, you can easily remap the Docker port to `5433:5432` with zero code changes.
* **Persistent Named Volumes**: Database files live in an isolated Docker volume (`postgres_data`), preserving data across container restarts while keeping your host OS clean.

### Why This Prepares You for VPS Hosting
* **Parity ("Works on My Machine = Works on VPS")**: The containers running on your local machine are identical to the containers running on Ubuntu on DigitalOcean, Hetzner, AWS EC2, or Linode.
* **Minimal VPS Dependencies**: Your VPS only needs Docker and Docker Compose installed. You do not need to install Node, npm, PM2, Python, or PostgreSQL directly on the server OS.
* **Simplified Security & Sandboxing**: Databases and internal microservices stay hidden in private Docker networks, exposed only to the web via a controlled reverse proxy.
* **Effortless Migration**: Moving from one VPS provider to another simply involves copying the repository, your `.env`, restoring a database dump, and running `docker compose up -d`.

---

## 2. Architecture Overview

```
                        ┌────────────────────────────────────────┐
                        │              Host Machine              │
                        │                                        │
[ Web Browser ] ───────>│ :5173 (Dev) or :80/:443 (Prod Nginx)   │
                        │                   │                    │
                        └───────────────────┼────────────────────┘
                                            │
                        ┌───────────────────▼────────────────────┐
                        │      Docker Virtual Bridge Network     │
                        │                                        │
                        │   ┌────────────────────────────────┐   │
                        │   │   client (Vite / React)        │   │
                        │   │   Proxy requests to /api       │   │
                        │   └───────────────┬────────────────┘   │
                        │                   │                    │
                        │   ┌───────────────▼────────────────┐   │
                        │   │   server (Express API :3000)   │   │
                        │   │   JWT / Passport / Routes      │   │
                        │   └───────────────┬────────────────┘   │
                        │                   │                    │
                        │   ┌───────────────▼────────────────┐   │
                        │   │   postgres (PostgreSQL 16)     │   │
                        │   │   Port: 5432 (Internal)        │   │
                        │   └───────────────┬────────────────┘   │
                        │                   │                    │
                        └───────────────────┼────────────────────┘
                                            ▼
                               [ postgres_data Volume ]
```

---

## 3. Required Docker Configurations & Files

Create the following files in your project directory:

### 3.1. `.dockerignore`

#### `/.dockerignore` & `/server/.dockerignore`
```dockerignore
node_modules
npm-debug.log
.git
.gitignore
.env
.env.local
coverage
dist
build
.DS_Store
*.log
```

#### `/client/.dockerignore`
```dockerignore
node_modules
dist
.git
.env
.env.local
npm-debug.log
.DS_Store
```

---

### 3.2. Server Dockerfile (`server/Dockerfile`)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies required for native modules (like bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package manifests first for optimal layer caching
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

EXPOSE 3000

# Default command (overridden in dev docker-compose if needed)
CMD ["node", "src/index.js"]
```

---

### 3.3. Client Dockerfile (`client/Dockerfile`)

This Dockerfile supports both development (hot reload) and production (multi-stage Nginx build):

```dockerfile
# syntax=docker/dockerfile:1

# --- Stage 1: Build & Development ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build static assets (used for production target)
RUN npm run build

# --- Stage 2: Production Web Server ---
FROM nginx:alpine AS production

# Copy custom Nginx configuration for React Router SPA handling
COPY <<-'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://server:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

### 3.4. Local Development Compose (`docker-compose.yml`)

This configuration mounts local directories for instant hot module reloading (HMR) in React and auto-restarting Node with `nodemon`.

```yaml
version: '3.8'

services:
  # ----------------------------------------------------
  # PostgreSQL Database Service
  # ----------------------------------------------------
  postgres:
    image: postgres:16-alpine
    container_name: dsa_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres_password}
      POSTGRES_DB: ${POSTGRES_DB:-dsa_focus}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-dsa_focus}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - dsa_network

  # ----------------------------------------------------
  # Express Backend API Service
  # ----------------------------------------------------
  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: dsa_server
    restart: unless-stopped
    command: npm run dev
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres_password}@postgres:5432/${POSTGRES_DB:-dsa_focus}
      JWT_SECRET: ${JWT_SECRET:-super-secret-dev-key-change-in-prod}
      JWT_EXPIRES_IN: 7d
      CLIENT_URL: http://localhost:5173
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      GOOGLE_CALLBACK_URL: http://localhost:3000/api/auth/google/callback
    volumes:
      - ./server:/app
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - dsa_network

  # ----------------------------------------------------
  # React + Vite Frontend Client Service
  # ----------------------------------------------------
  client:
    build:
      context: ./client
      dockerfile: Dockerfile
      target: builder
    container_name: dsa_client
    restart: unless-stopped
    command: npm run dev -- --host 0.0.0.0
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3000/api
    volumes:
      - ./client:/app
      - /app/node_modules
    depends_on:
      - server
    networks:
      - dsa_network

volumes:
  postgres_data:
    name: dsa_postgres_data

networks:
  dsa_network:
    name: dsa_network
    driver: bridge
```

---

### 3.5. Production Compose (`docker-compose.prod.yml`)

Optimized for cloud VPS hosting with static production builds and single-entry point routing:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: dsa_postgres_prod
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - dsa_prod_network

  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: dsa_server_prod
    restart: always
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: 7d
      CLIENT_URL: https://${DOMAIN_NAME}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      GOOGLE_CALLBACK_URL: https://${DOMAIN_NAME}/api/auth/google/callback
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - dsa_prod_network

  client:
    build:
      context: ./client
      dockerfile: Dockerfile
      target: production
    container_name: dsa_client_prod
    restart: always
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - server
    networks:
      - dsa_prod_network

volumes:
  postgres_prod_data:
    name: dsa_postgres_prod_data

networks:
  dsa_prod_network:
    name: dsa_prod_network
    driver: bridge
```

---

### 3.6. Environment File (`.env.example`)

Create a `.env` in the root directory:

```env
# Database Credentials
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres_password
POSTGRES_DB=dsa_focus
POSTGRES_PORT=5432

# Application Secrets
JWT_SECRET=super_strong_random_jwt_secret_key_12345
CLIENT_URL=http://localhost:5173

# Optional: Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Production VPS Only
DOMAIN_NAME=yourdomain.com
```

---

## 4. Step-by-Step Local Setup & Execution

Follow these steps on your machine:

### Step 1: Initialize Environment
```bash
cp .env.example .env
```

### Step 2: Build and Start Containers
```bash
docker compose up -d --build
```

### Step 3: Run Database Migrations & Initial Seed
Once the database container is healthy:
```bash
# Run database schema migrations
docker compose exec server npm run migrate

# (Optional) Seed sample data
docker compose exec server npm run seed
```

### Step 4: Access Your Application
* **Frontend Web App**: [http://localhost:5173](http://localhost:5173)
* **Backend API**: [http://localhost:3000/api](http://localhost:3000/api)
* **Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 5. Database Management & Migration Workflow

### Running Migrations & Seeds
You can execute migration commands inside the running server container without touching the host:
```bash
# Apply pending migrations
docker compose exec server npm run migrate

# Run seeding script
docker compose exec server npm run seed
```

### Connecting via GUI Clients
You can connect to your containerized Postgres database with tools like **TablePlus**, **DBeaver**, **pgAdmin**, or the **VS Code Database Client** extension using:
* **Host**: `localhost` (or `127.0.0.1`)
* **Port**: `5432`
* **User**: `postgres` (or value from `.env`)
* **Password**: `postgres_password` (or value from `.env`)
* **Database**: `dsa_focus`

Or access `psql` directly in your terminal:
```bash
docker compose exec postgres psql -U postgres -d dsa_focus
```

### Backups (`pg_dump`) & Restores

#### Create a Backup from Container:
```bash
docker compose exec -T postgres pg_dump -U postgres dsa_focus > backup_$(date +%F).sql
```

#### Restore a Backup into Container:
```bash
cat backup_2026-08-22.sql | docker compose exec -T postgres psql -U postgres -d dsa_focus
```

### Migrating from Legacy SQLite to Postgres Container
If you have existing problems in `backend/dsa_problems.db`, you can run the built-in migration script directly inside the container:
```bash
docker compose exec -e MIGRATE_USER_EMAIL="admin@dsafocus.dev" server node src/scripts/migrate-sqlite.js
```

---

## 6. Roadmap to Production VPS Hosting

When you are ready to host the application on a Cloud VPS (such as Hetzner, DigitalOcean Droplet, Linode, or AWS EC2), follow this streamlined roadmap:

### 1. Provision VPS & Install Docker
1. Spin up an **Ubuntu 24.04 LTS** VPS instance (1 GB or 2 GB RAM is plenty).
2. SSH into your VPS:
   ```bash
   ssh root@<YOUR_VPS_IP>
   ```
3. Install Docker and Docker Compose Plugin:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   apt install -y docker-compose-plugin ufw git
   ```
4. Configure basic firewall:
   ```bash
   ufw allow OpenSSH
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```

### 2. Deploy the Project on VPS
1. Clone your repository:
   ```bash
   git clone <YOUR_GIT_REPO_URL> /var/www/dsa_focus
   cd /var/www/dsa_focus
   ```
2. Create your production `.env` with strong random passwords:
   ```bash
   cp .env.example .env
   nano .env
   ```
3. Start production containers:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. Run migrations:
   ```bash
   docker compose -f docker-compose.prod.yml exec server npm run migrate
   ```

### 3. SSL / HTTPS with Certbot or Caddy Reverse Proxy
For automated HTTPS certificates, you can either:
* Place **Caddy** or **Nginx + Certbot** on the host in front of container port 80.
* Or add a `certbot` container to `docker-compose.prod.yml`.

### 4. Zero-Downtime Update Script
Create `/var/www/dsa_focus/deploy.sh`:
```bash
#!/bin/bash
set -e

echo "🚀 Pulling latest code..."
git pull origin main

echo "🔨 Rebuilding & restarting containers..."
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

echo "🗄️ Running migrations..."
docker compose -f docker-compose.prod.yml exec -T server npm run migrate

echo "🧹 Cleaning up old unused images..."
docker image prune -f

echo "✅ Deployment successful!"
```
Make it executable: `chmod +x deploy.sh`

### 5. Automated Database Backups via Cron
Add a daily cron job (`crontab -e`):
```cron
0 3 * * * cd /var/www/dsa_focus && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres dsa_focus | gzip > /var/backups/dsa_focus_$(date +\%F).sql.gz
```

---

## 7. Essential Docker Cheat Sheet

| Task | Command |
| :--- | :--- |
| **Start in background** | `docker compose up -d` |
| **Rebuild containers** | `docker compose up -d --build` |
| **View streaming logs** | `docker compose logs -f` |
| **View logs for one service** | `docker compose logs -f server` |
| **Stop all containers** | `docker compose down` |
| **Stop & wipe all DB volumes** | `docker compose down -v` |
| **Run command inside container** | `docker compose exec server <command>` |
| **Inspect container health** | `docker compose ps` |
| **Check container resource usage**| `docker stats` |
