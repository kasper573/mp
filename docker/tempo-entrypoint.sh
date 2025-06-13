#!/bin/sh
# Fix permissions for tempo data directory
mkdir -p /data/blocks /data/wal /data/generator
chown -R 10001:10001 /data
# Execute the original command
exec "$@"