# ioc

Tiny inversion of control utility

This package implements a lightweight dependency injection container with both mutable and immutable variants. It uses injection contexts as keys for type-safe value retrieval, ensuring dependencies are properly typed at compile time. The system supports optional dependencies with default values and provides clear error messages for missing dependencies. The implementation uses symbols to prevent direct access to stored values, enforcing proper dependency resolution through the container interface. It's designed to be minimal yet robust for managing service dependencies across the application.
