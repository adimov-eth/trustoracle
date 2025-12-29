#!/bin/bash
set -e

LOG_FILE="/var/log/trustoracle-deploy.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo ""
echo "=========================================="
echo "  TrustOracle Deployment"
echo "  $(date)"
echo "=========================================="

cd /root/trustoracle

# Pull latest changes
echo ""
echo "[1/6] Pulling latest changes..."
git pull origin main

# Install dependencies
echo ""
echo "[2/6] Installing dependencies..."
/root/.bun/bin/bun install

# Build frontend
echo ""
echo "[3/6] Building frontend..."
cd /root/trustoracle/frontend && /root/.bun/bin/bun run build

# Build admin
echo ""
echo "[4/6] Building admin..."
cd /root/trustoracle/admin && /root/.bun/bin/bun run build

# Copy to www directory
echo ""
echo "[5/6] Deploying static files..."
rm -rf /var/www/trustoracle/frontend/* /var/www/trustoracle/admin/*
cp -r /root/trustoracle/frontend/dist/* /var/www/trustoracle/frontend/
cp -r /root/trustoracle/admin/dist/* /var/www/trustoracle/admin/
chown -R www-data:www-data /var/www/trustoracle

# Restart backend
echo ""
echo "[6/6] Restarting backend..."
systemctl restart trustoracle-backend

# Wait for backend to be ready
echo ""
echo "Waiting for backend to start..."
sleep 3

# Health check
echo ""
/root/trustoracle/scripts/healthcheck.sh

echo ""
echo "Deployment complete!"
echo "=========================================="
