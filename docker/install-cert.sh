#!/bin/bash

COMPOSE_ENV=dev docker compose -f docker-compose.yaml -f docker-compose.dev.yaml cp \
    caddy:/data/caddy/pki/authorities/local/root.crt \
    /usr/local/share/ca-certificates/root.crt \
  && sudo update-ca-certificates