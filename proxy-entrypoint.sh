#!/bin/bash

rm -rf /data/nginx/custom
cp -r /mp-custom-nginx-config/  /data/nginx/custom
echo "Copying custom nginx config to /data/nginx/custom"
