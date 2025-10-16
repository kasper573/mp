# GitHub Copilot Custom Instructions

## Repository Overview

This is an online RPG built in TypeScript using a monorepo structure with pnpm workspaces. The project includes multiple apps (game-service, api-service, gateway, website), integrations, and libraries.

## Package Manager and Node Version

- **Package Manager**: pnpm 10.4.0
- **Node Version**: 22.17.0
- Always use `pnpm` for package management commands (not npm or yarn)
- Use `pnpm -F <workspace>` to run commands in specific workspaces

## Code Quality Commands

After finishing your task, always run and ensure the following commands pass:

- `pnpm lint` - Runs oxlint, ls-lint, manypkg check, knip, and eslint
- `pnpm format` - Checks code formatting with Prettier
- `pnpm test` - Runs all tests across workspaces
- `pnpm build` - Builds all packages

If changes are needed, use:

- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format:fix` - Auto-format code with Prettier

## Monorepo Structure and Dependencies

This repository follows a strict dependency hierarchy:

1. **libraries/** - Generic, low-level systems with no business logic
   - Should be highly configurable and modular
   - May export untranspiled TypeScript code
   - Can depend on other libraries (prefer minimal dependencies)
   - Core libraries: `@mp/std`, `@mp/time`, `@mp/state`

2. **integrations/** - Compositions of libraries or third-party service integrations
   - May depend on libraries
   - Cannot depend on apps (except `@mp/game-service` typedefs for event router)

3. **apps/** - Deployable executables with business logic
   - May depend on other apps via protocol (HTTP) rather than code
   - Responsible for bundling
   - Apps: gateway, game-service, api-service, website, loadtest, e2e

**Rule**: Lower level workspaces may NOT depend on higher level workspaces.

## Architecture Principles

- **Authoritative server, simple client**: Minimize optimistic operations on the client
- **State management**: Use signals from `@mp/state` (wraps `@preact/signals-core`)
  - In UI layer: Can use preact signals directly
  - In other systems: Depend on `@mp/state` instead of preact
- **Modularity**: Keep packages decoupled; compose in apps
- **Docker**: All docker concerns in `/docker` folder, loosely coupled with codebase
- **CI/CD**: Lint, test, build, deploy in pipeline

## Development Workflow

### Initial Setup

```bash
# Install dependencies
pnpm install

# Initialize database (if working with database)
pnpm -F db devenv push
pnpm -F db devenv seed

# Provision keycloak roles (if working with auth)
pnpm -F keycloak devenv provision
```

### Daily Development

```bash
# Start all services in development mode
pnpm dev

# Work on specific workspace
pnpm -F <workspace-name> dev
```

### Database Changes

- Use drizzle-kit via: `pnpm -F db devenv <drizzle-kit command>`

### Docker Changes

- Use `./docker/dockerctl.sh` script for docker compose commands

## Code Style and Conventions

- **Language**: TypeScript (catalog version managed centrally)
- **Formatting**: Prettier with repository config
- **Linting**: Multiple linters (oxlint, ls-lint, eslint)
- **File naming**: Use kebab-case (enforced by ls-lint)
- **Imports**: Use workspace aliases (e.g., `@mp/std`)
- **Type safety**: Prefer strict TypeScript, avoid `any`

## Testing Practices

- Tests live alongside source code or in `test/` directories
- Use existing test infrastructure in each workspace
- Run tests with: `pnpm test` (all) or `pnpm -F <workspace> test` (specific)

## Common Workspace Patterns

### Key Workspaces

- `@mp/game-service` - Core game logic and state management
- `@mp/api-service` - REST API for character/game data
- `@mp/gateway` - WebSocket gateway for game clients
- `@mp/website` - Frontend website
- `@mp/game-client` - Game client integration
- `@mp/db` - Database integration with Drizzle ORM
- `@mp/keycloak` - Authentication integration
- `@mp/std` - Standard utilities
- `@mp/state` - State management (signals)

### Running Workspace Commands

```bash
pnpm -F <workspace> <command>  # Single workspace
pnpm -r <command>              # All workspaces (recursive)
pnpm -r --parallel <command>   # Parallel execution
pnpm -r --stream <command>     # Stream output
```

## Important Notes

- **Docker development**: Host apps run on host machine; third-party services in Docker
- **Environment files**: Use `.env` files managed by dotenvx
- **Certificates**: Local HTTPS uses custom certificates (see readme for setup)
- **Production**: Auto-deploys from main branch via GitHub Actions
