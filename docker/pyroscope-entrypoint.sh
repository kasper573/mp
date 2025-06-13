#!/bin/sh
# Fix permissions for pyroscope data directory
mkdir -p /data
chown -R pyroscope:pyroscope /data
# Execute the original command
exec "$@"