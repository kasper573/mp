#!/bin/bash

file="/srv/mp-website/index.html"
prefix="MP_WEBSITE_"
placeholder="__ENV_PLACEHOLDER__"

# Select environment variables
selected_env=$(env | awk -F= -v prefix="$prefix" '
  $1 ~ "^" prefix {
    printf "\"%s\":\"%s\",", $1, $2;
  }
' | sed 's/,$//')
selected_env="{${selected_env}}"

# Replace the placeholder in the file
html=$(cat "$file")
updated_html=$(echo "$html" | sed "s|$placeholder|$selected_env|g")
echo "$updated_html" > "$file"

# Keep the container running (it's just a volume for Caddy to serve from)
tail -f /dev/null
