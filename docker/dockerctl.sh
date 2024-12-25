#!/bin/bash

# This is a wrapper convention around docker compose.
# It ensures that the appropriate compose files/configurations are used for the given environment.
# Always use this script to run docker compose commands.

COMPOSE_ENV=$1
shift

DOCKER_COMPOSE_CMD="docker compose --profile $COMPOSE_ENV"

if [ -f "docker-compose.$COMPOSE_ENV.yaml" ]; then
  DOCKER_COMPOSE_CMD="$DOCKER_COMPOSE_CMD -f docker-compose.yaml -f docker-compose.$COMPOSE_ENV.yaml"
fi

export COMPOSE_ENV=$COMPOSE_ENV

echo "Running: $DOCKER_COMPOSE_CMD $@"

$DOCKER_COMPOSE_CMD "$@"
