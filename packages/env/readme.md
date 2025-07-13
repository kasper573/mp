# env

Environment variable parsing and validation utilities

This package provides robust environment variable parsing with schema validation using Valibot. It converts flat environment variables into nested objects and validates them against TypeScript schemas. The package supports dot notation for nested properties (e.g., `API_DATABASE_HOST` becomes `api.database.host`) and includes comprehensive error reporting for validation failures. It exports all Valibot functionality while adding custom parsing logic specifically designed for environment variable patterns commonly used in containerized applications.
