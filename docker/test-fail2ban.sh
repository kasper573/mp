#!/bin/bash

# Test script to verify fail2ban configuration and functionality
# This script should be run from the docker directory

set -e

echo "Testing fail2ban integration..."

# Check if fail2ban container builds successfully
echo "1. Building fail2ban container..."
./dockerctl.sh test build fail2ban

# Test basic container functionality
echo "2. Testing container can run commands..."
docker run --rm mp/mp-fail2ban:latest echo "Container works!"

# Test docker-compose configuration
echo "3. Testing docker-compose configuration..."
# Validate docker-compose configuration includes fail2ban service
if COMPOSE_ENV=test docker compose --profile test config | grep -q "fail2ban:"; then
  echo "  ✓ fail2ban service found in docker-compose configuration"
else
  echo "  ✗ fail2ban service not found in docker-compose configuration"
  exit 1
fi

# Validate key configuration elements
echo "4. Validating configuration elements..."

# Check Caddyfile has access logging
if grep -q "access_log" Caddyfile; then
  echo "  ✓ Caddy access logging is configured"
else
  echo "  ✗ Caddy access logging not found in Caddyfile"
  exit 1
fi

# Check environment variables are configured  
if grep -q "FAIL2BAN_" .env.shared; then
  echo "  ✓ Fail2ban environment variables configured"
else
  echo "  ✗ Fail2ban environment variables not found"
  exit 1
fi

# Check fail2ban configuration files exist
if [ -f "fail2ban/jail.d/caddy.conf" ] && [ -f "fail2ban/filter.d/caddy-general.conf" ]; then
  echo "  ✓ Fail2ban configuration files exist"
else
  echo "  ✗ Fail2ban configuration files missing"
  exit 1
fi

# Check volumes are configured
if COMPOSE_ENV=test docker compose --profile test config | grep -q "caddy-logs"; then
  echo "  ✓ Shared log volumes configured"
else
  echo "  ✗ Shared log volumes not configured"
  exit 1
fi

echo ""
echo "✓ All fail2ban integration tests passed successfully!"
echo ""
echo "Fail2ban has been successfully integrated into the docker stack."
echo ""
echo "Usage:"
echo "  # Start the stack with fail2ban (production/test profiles)"
echo "  ./dockerctl.sh prod up -d"
echo ""
echo "  # Monitor fail2ban status"
echo "  docker logs mp-fail2ban"
echo "  docker exec mp-fail2ban fail2ban-client status"
echo ""
echo "  # Check banned IPs"
echo "  docker exec mp-fail2ban fail2ban-client status caddy-general"
echo ""
echo "See docker/FAIL2BAN.md for detailed documentation."