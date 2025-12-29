#!/bin/bash
set -e

cd /root/trustoracle

echo "$(date): Starting deployment..."

# Pull latest changes
git pull origin main

# Install dependencies
/root/.bun/bin/bun install

# Build frontend apps
cd /root/trustoracle/frontend && /root/.bun/bin/bun run build
cd /root/trustoracle/admin && /root/.bun/bin/bun run build

# Restart backend
systemctl restart trustoracle-backend

echo "$(date): Deployment complete!"
