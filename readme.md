# mp

# mp

An online RPG built in [Rust](https://www.rust-lang.org/).

This is a pet project originally built in TypeScript and now rewritten entirely in Rust, including both the server and client components.

## Stack

- **Backend**: Rust with Axum web framework
- **Frontend**: Rust WASM with Leptos
- **Database**: PostgreSQL with SQLx
- **Authentication**: Keycloak integration
- **Deployment**: Docker and Docker Compose
- **Monitoring**: Grafana, Prometheus, Loki, Tempo

## Design goals

- **Performance**: Leverage Rust's zero-cost abstractions and memory safety
- **Type Safety**: Compile-time guarantees across the entire stack
- **Real-time**: WebSocket-based multiplayer game communication
- **Scalability**: Efficient resource utilization with async Rust
- **Maintainability**: Clear separation of concerns with crate-based architecture

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

### Quick Start

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd mp
   ```

2. Start the development environment:
   ```bash
   # Start infrastructure services (PostgreSQL, Keycloak, etc.)
   cd docker
   ./dockerctl.sh dev up

   # In a separate terminal, start the Rust server
   cd server
   cargo run

   # In another terminal, build and serve the client
   cd client
   trunk serve --open
   ```

### Building

```bash
# Build the entire workspace
cargo build

# Build for release
cargo build --release

# Build specific components
cargo build -p mp-server
cargo build -p mp-client
```

### Testing

```bash
# Run all tests
cargo test

# Run tests for specific crates
cargo test -p mp-auth
cargo test -p mp-rpc
```

## Architecture

### Crates

- **mp-server**: Main server application built with Axum
- **mp-client**: WASM client application built with Leptos
- **mp-auth**: Authentication and authorization logic
- **mp-db**: Database models and migration handling
- **mp-game**: Shared game logic and state management
- **mp-logger**: Structured logging utilities
- **mp-rpc**: RPC communication layer over WebSockets

### Docker

The project uses Docker for both development and production deployments. The infrastructure includes:

- **PostgreSQL**: Primary database
- **Keycloak**: Identity and access management
- **Redis**: Caching and session storage
- **Grafana Stack**: Monitoring and observability

### If you make docker related changes

You will have to perform the appropriate docker compose commands to apply your changes by using the `dockerctl.sh` script.

### If you make database related changes

Database migrations are handled by SQLx. To create a new migration:

```bash
cd crates/mp-db
sqlx migrate add <migration_name>
```

## Production deployment

This repository comes with a github actions workflow that performs automatic
deployments whenever the main branch receives updates. It's a simple deploy
script designed to deploy to a single remote machine. It logs in to your remote
machine via ssh and updates or initializes the docker stack utilizing the same
docker compose file as in development but with production environment variables
provided via github action variables and secrets.

Review the workflow to see which variables and secrets you need to provide.

## Credits

Originally built in TypeScript and rewritten in Rust for improved performance and type safety.

[Adventurer character model by @sscary](https://sscary.itch.io/the-adventurer-male)
