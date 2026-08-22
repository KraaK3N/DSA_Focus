# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install native build tools needed for bcrypt and sqlite3
RUN apk add --no-cache python3 make g++

# Copy package manifests first for optimal layer caching
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

EXPOSE 3000

# Default command (can be overridden in dev compose)
CMD ["node", "src/index.js"]
