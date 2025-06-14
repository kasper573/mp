#!/bin/bash

# This script ensures that the required databases exist, regardless of whether
# PostgreSQL's initialization process ran or not. This is particularly useful
# on WSL and other environments where the PostgreSQL data directory persists
# between container restarts, causing the standard initialization scripts to be skipped.

set -e

echo "Starting PostgreSQL with database initialization check..."

# Start PostgreSQL in the background temporarily to check/create databases
echo "Starting PostgreSQL temporarily for database check..."
docker-entrypoint.sh postgres &
PG_PID=$!

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h localhost -p 5432 -U "$POSTGRES_USER" >/dev/null 2>&1; do
    sleep 2
done

echo "PostgreSQL is ready, checking databases..."

function create_user_and_database() {
    local database=$1
    echo "  Ensuring user and database '$database' exist"

    # Create database user if it does not exist
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" -tAc \
        "SELECT 1 FROM pg_roles WHERE rolname='$database'" | grep -q 1 || \
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
            CREATE USER $database;
EOSQL

    # Create the database if it does not exist
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" -tAc \
        "SELECT 1 FROM pg_database WHERE datname='$database'" | grep -q 1 || \
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
            CREATE DATABASE $database;
            GRANT ALL PRIVILEGES ON DATABASE $database TO $database;
EOSQL
}

# Ensure the required databases exist
if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
    echo "Ensuring multiple databases exist: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
        create_user_and_database $db
    done
    echo "All required databases ensured to exist"
fi

# Stop the temporary PostgreSQL instance
echo "Stopping temporary PostgreSQL instance..."
kill $PG_PID
wait $PG_PID

echo "Database initialization check completed, starting PostgreSQL normally..."

# Start PostgreSQL normally
exec docker-entrypoint.sh postgres