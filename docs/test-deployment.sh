#!/bin/bash

# Test script for the horizontal scaling deployment
# This script tests the basic functionality of the new architecture

set -e

echo "🚀 Testing Horizontal Scaling Architecture"
echo "========================================="

# Check if services are running
echo "1. Checking service health..."

# Test API Server
echo "   - Testing API server..."
API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/health || echo "000")
if [ "$API_HEALTH" = "200" ]; then
    echo "   ✓ API server is healthy"
else
    echo "   ✗ API server is not responding (HTTP $API_HEALTH)"
    exit 1
fi

# Test Island Area Server
echo "   - Testing island area server..."
ISLAND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health || echo "000")
if [ "$ISLAND_HEALTH" = "200" ]; then
    echo "   ✓ Island area server is healthy"
else
    echo "   ✗ Island area server is not responding (HTTP $ISLAND_HEALTH)"
    exit 1
fi

# Test Forest Area Server
echo "   - Testing forest area server..."
FOREST_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/health || echo "000")
if [ "$FOREST_HEALTH" = "200" ]; then
    echo "   ✓ Forest area server is healthy"
else
    echo "   ✗ Forest area server is not responding (HTTP $FOREST_HEALTH)"
    exit 1
fi

# Test Asset Serving
echo "2. Testing asset serving..."
ASSET_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/public/areas/island.json || echo "000")
if [ "$ASSET_RESPONSE" = "200" ]; then
    echo "   ✓ Assets are being served correctly"
else
    echo "   ✗ Assets are not being served (HTTP $ASSET_RESPONSE)"
    exit 1
fi

# Test Area Server Discovery (would need RPC client for this)
echo "3. Testing area server discovery..."
echo "   ⚠ Area server discovery requires RPC client - skipping for now"

echo ""
echo "✅ All basic tests passed!"
echo ""
echo "🎯 Architecture Summary:"
echo "   - API Server: http://localhost:9999"
echo "   - Island Area Server: http://localhost:3001"
echo "   - Forest Area Server: http://localhost:3002"
echo "   - Database: postgres://localhost:5432/mp_game"
echo ""
echo "🏗️ Next steps:"
echo "   1. Connect client to API server for discovery"
echo "   2. Implement area server switching on client side"
echo "   3. Test portal transitions between areas"
echo "   4. Add monitoring and logging"