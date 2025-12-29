#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ADMIN_KEY="97cedbfbfc752a0cad3b121fc4a1e0b8af2fdc10c0234202"
BACKEND_URL="https://backend.rubeton.app"
FRONTEND_URL="https://trust.rubeton.app"
ADMIN_URL="https://api-trust.rubeton.app"

echo "========================================"
echo "  TrustOracle Health Check"
echo "  $(date)"
echo "========================================"
echo ""

# Backend health
echo -n "Backend API: "
HEALTH=$(curl -sf "$BACKEND_URL/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    STATUS=$(echo "$HEALTH" | jq -r '.status')
    BLOCKS_BEHIND=$(echo "$HEALTH" | jq -r '.checks.blocksBehind')
    if [ "$STATUS" = "ok" ]; then
        echo -e "${GREEN}OK${NC} (blocks behind: $BLOCKS_BEHIND)"
    elif [ "$STATUS" = "degraded" ]; then
        echo -e "${YELLOW}DEGRADED${NC} (blocks behind: $BLOCKS_BEHIND)"
    else
        echo -e "${RED}$STATUS${NC}"
    fi
else
    echo -e "${RED}UNREACHABLE${NC}"
fi

# Admin API
echo -n "Admin API: "
ADMIN_RESP=$(curl -sf -H "X-Admin-Key: $ADMIN_KEY" "$BACKEND_URL/api/v1/admin/statistics" 2>/dev/null)
if [ $? -eq 0 ]; then
    WALLETS=$(echo "$ADMIN_RESP" | jq -r '.totalWallets')
    echo -e "${GREEN}OK${NC} ($WALLETS wallets registered)"
else
    echo -e "${RED}FAILED${NC}"
fi

# Frontend
echo -n "Frontend: "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$FRONTEND_URL/" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}HTTP $HTTP_CODE${NC}"
fi

# Admin panel
echo -n "Admin Panel: "
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$ADMIN_URL/" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}HTTP $HTTP_CODE${NC}"
fi

echo ""

# Systemd services
echo "Services:"
echo -n "  trustoracle-backend: "
if systemctl is-active --quiet trustoracle-backend; then
    echo -e "${GREEN}running${NC}"
else
    echo -e "${RED}stopped${NC}"
fi

echo -n "  nginx: "
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}running${NC}"
else
    echo -e "${RED}stopped${NC}"
fi

echo ""

# Disk usage
echo "Disk usage:"
df -h / | awk 'NR==2 {print "  Root: " $5 " used (" $4 " free)"}'

# Memory
echo "Memory:"
free -h | awk 'NR==2 {print "  RAM: " $3 " used / " $2 " total"}'

echo ""
echo "========================================"
