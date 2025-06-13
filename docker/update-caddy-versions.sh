#!/bin/bash

# Script to check and update Caddy plugin versions for better Docker caching
# Usage: ./update-caddy-versions.sh [plugin-name]

PLUGIN_NAME=${1:-"github.com/mholt/caddy-ratelimit"}

echo "Checking available versions for $PLUGIN_NAME..."

# Use docker to run go list to get available versions
docker run --rm golang:1.23 go list -m -versions "$PLUGIN_NAME" 2>/dev/null || {
    echo "Error: Could not fetch versions for $PLUGIN_NAME"
    echo "Make sure the plugin name is correct and accessible"
    exit 1
}

echo ""
echo "To update to a specific version, edit docker/Dockerfile.caddy and change:"
echo "    --with $PLUGIN_NAME@<version>"
echo ""
echo "Current Dockerfile:"
grep -A 2 -B 2 "$PLUGIN_NAME" docker/Dockerfile.caddy || echo "Plugin not found in Dockerfile"