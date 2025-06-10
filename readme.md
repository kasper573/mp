# mp

An online rpg built in [TypeScript](https://www.typescriptlang.org/).

This is a pet project that I'm working on over the weekends over at
https://www.twitch.tv/kasper_573.

I'm doing this project for fun and to teach myself more about multiplayer game development and web development infrastructure.

## Stack

- 2d graphics: [pixi.js](https://pixijs.com/)
- maps: [tiled](https://www.mapeditor.org/) (+custom
  [loader](packages/tiled-loader)/[renderer](packages/tiled-renderer))
- ui: [solid-js](https://www.solidjs.com/)
- database: [postgres](https://www.postgresql.org/) +
  [drizzle](https://orm.drizzle.team/)
- network: [ws](https://www.npmjs.com/package/ws) (+custom [rpc](packages/rpc) & [sync](packages/sync))
- auth: [keycloak](https://www.keycloak.org/)
- observability: [grafana](https://grafana.com)

## Design goals

- CI/CD: Lint, test, build, deploy in pipeline.
- Highly replicable: Containerized development, test and production environments.
- (near) Zero config: Just clone and run.
- [Modularity](#monorepo-package-convention)
- Authoritative server, dead simple client
  - little to no optimistic operations (maybe some lerping)
  - subscribe to state changes, render them.
- Dynamically loaded and served game content
  - only reusable and built-in game mechanics is part of this repo.
  - game content like models, maps, npcs, monsters, etc. is not part of this repo.
  - should be provided externally when deploying.

## Development

Local development is done using node and docker compose.

### Initial setup (only required once)

- Install [Docker](https://www.docker.com/)
- Install [NodeJS](https://nodejs.org/)
- Clone this repository
- Run `cd docker && COMPOSE_ENV=dev docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d`
- Enable and prepare [corepack](https://nodejs.org/docs/v22.12.0/api/corepack.html#corepack) for this repo
- Run `pnpm install`
- Run `./docker/install-cert.sh`
  > You may need to add the root certificate manually to your browser depending
  > on which browser you are using.
- Run `pnpm -F server devenv db push` to initialize your database
- Run `pnpm -F server devenv provision` to provision keycloak roles
- Sign in as admin to `auth.mp.localhost` and create a test account and add yourself to the `admin` group

### Development with VS Code Devcontainers

Alternatively, you can use VS Code Devcontainers for a consistent development environment:

1. Install [VS Code](https://code.visualstudio.com/) and the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open the repository in VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and select "Dev Containers: Reopen in Container"
4. VS Code will build and start the development containers automatically
5. The mp-server and mp-client will run inside containers with hot reload enabled
6. All services (postgres, keycloak, etc.) will be available and properly networked

This provides the benefits of containerized development while maintaining excellent developer experience with hot reload and VS Code integration.

### Before each development session

- Run `pnpm dev`
- Visit `https://mp.localhost` in your browser

### If you make docker related changes

You will have to perform the appropriate docker compose commands to apply your changes. For development, use `COMPOSE_ENV=dev docker compose -f docker-compose.yaml -f docker-compose.dev.yaml <command>`. For production, use `COMPOSE_ENV=prod docker compose -f docker-compose.yaml -f docker-compose.prod.yaml <command>`.

### If you make database related changes

You will need to use [drizzle-kit](https://orm.drizzle.team/docs/kit-overview).

Run its cli against the development environment using `pnpm -F server devenv db <drizzle-kit command>`.

### If you change user roles

User roles are defined in typescript source code as a single source of truth and provisioned to keycloak via the `provision` script in the `server` package. If you make changes to the user roles you will have to run the provisioning script to update your keycloak instance.

> Production is provisioned automatically when changes are pushed to master, so you don't have to handle that manually.

### Quirks

While most of the repo should be fairly conventional, I've made a few choices that may be unexpected and is worth mentioning. Here's what you need to know:

In development, our own apps run inside the docker network using development-optimized containers that support hot reload and volume mounting, while 3rd party services also run inside the docker network. This provides excellent development experience since source code changes are immediately reflected without rebuilding containers, while still maintaining a consistent containerized environment.

> This is made possible using development-specific Dockerfiles and docker compose configurations that mount source code as volumes and use development tools like tsx watch for hot reload.

Docker compose is used directly for container management. For development, use `COMPOSE_ENV=dev docker compose -f docker-compose.yaml -f docker-compose.dev.yaml <commands>`. For production, use `COMPOSE_ENV=prod docker compose -f docker-compose.yaml -f docker-compose.prod.yaml <commands>`. You can also use the default configuration with just `docker compose <commands>` which will automatically load the development overrides via docker-compose.override.yaml.

## Docker

All docker concerns reside in [/docker](/docker) and should be very loosely
coupled with the rest of the codebase. Docker should only be aware of
application and package build/dev tasks, their output artifacts and environment
variables.

The `/docker` folder is designed to serve both as the required configuration for building docker images and running docker containers:

Building images: You can build docker images from source, and it will depend on the rest of the source code from the repo to be present.

Starting containers: You can also start containers for prebuilt docker images, in which case only the `/docker` folder is required to be present. You can do so by running docker compose with the production configuration. In fact, this is how the production environment is managed: The CI uploads the `/docker` folder to the production server as a runtime dependency, and runs `COMPOSE_ENV=prod docker compose -f docker-compose.yaml -f docker-compose.prod.yaml <command>`.

# Production deployment

This repository comes with a github actions workflow that performs automatic
deployments whenever the main branch receives updates. It's a simple deploy
script designed to deploy to a single remote machine. It logs in to your remote
machine via ssh and updates or initializes the docker stack utilizing the same
docker compose file as in development but with production environment variables
provided via github action variables and secrets.

Review the workflow to see which variables and secrets you need to provide.

# Monorepo package convention

This repository utilizes pnpm workspaces to organize and separate concerns. Lower level workspaces may not depend on higher level workspaces.

These are the workspaces, in order:

## apps

Compositions of packages. Often has deployable artifacts, but is not required to. May depend on other apps, but it's preferable to do so via protocol (ie. http requests) rather than direct dependency on code.

## packages

Generic and low level systems.

Should be highly configurable and may not contain hard coded configuration or depend on dependency injection.

Dependencies must instead be provided as arguments.

# Credits

[Adventurer character model by @sscary](https://sscary.itch.io/the-adventurer-male)
