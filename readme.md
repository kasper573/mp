# mp

A retro, point and click, hack and slash online rpg built in [TypeScript](https://www.typescriptlang.org/).

This is a pet project that I'm working on over the weekends over at
https://www.twitch.tv/kasper_573.

I'm doing this project for fun and to teach myself more about multiplayer game development and web development infrastructure.

## Stack

- 2d graphics: [Pixi](https://pixijs.com/)
- maps: [Tiled](https://www.mapeditor.org/) (+custom
  [loader](libraries/tiled-loader)/[renderer](libraries/tiled-renderer))
- ui: [SolidJS](https://www.solidjs.com/)
- database: [postgres](https://www.postgresql.org/) +
  [drizzle orm](https://orm.drizzle.team/)
- network: [ws](https://www.npmjs.com/package/ws) + [trpc](https://trpc.io/)
- auth: [keycloak](https://www.keycloak.org/)
- observability: [Grafana LGTM + Faro](https://grafana.com/oss/faro/)

## Design goals

- CI/CD: Lint, test, build, deploy in pipeline.
- Highly replicable: Containerized development, test and production environments.
- (near) Zero config: Just clone and run.
- [Modularity](#monorepo-package-convention)
- Authorative server, dead simple client
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
- Run `cd docker && ./dockerctl.sh dev up -d`
- Enable and prepare [corepack](https://nodejs.org/docs/v22.12.0/api/corepack.html#corepack) for this repo
- Run `pnpm install`
- Run `./docker/install-cert.sh`
  > You may need to add the root certificate manually to your browser depending
  > on which browser you are using.

### Before each development session

- Run `pnpm dev`
- Visit `https://mp.localhost` in your browser

### If you make docker related changes

You will have to perform the appropriate docker compose commands to apply your changes by using the `dockerctl.sh` script. See [quirks](#quirks).

### If you make database related changes

You will need to use [drizzle-kit](https://orm.drizzle.team/docs/kit-overview).

Run its cli against the development environment using `pnpm -F server devenv db <drizzle-kit command>`.

### Quirks

While most of the repo should be fairly conventional, I've made a few choices that may be unexpected and is worth mentioning. Here's what you need to know:

In development, our own apps run on the host machine and outside of the docker network, while 3rd party services run inside the docker network, contrary to production and testing where everything runs inside the docker network.

> This provides the best development experience since a large amount of node development tools expect you to interact with them directly on the host machine, ie. vscode's language service, vite dev server, drizzle-kit cli, pnpm link, etc.

We don't use docker compose directly in the CLI. Instead we use a wrapper script that in turn will run the appropriate docker compose commands. See [dockerctl.sh](./docker/dockerctl.sh) for more information.

## Docker

All docker concerns reside in [/docker](/docker) and should be very loosely
coupled with the rest of the codebase. Docker should only be aware of
application and package build/dev tasks, their output artifacts and environment
variables.

# Production deployment

This repository comes with a github actions workflow that performs automatic
deployments whenever the main branch receives updates. It's a simple deploy
script designed to deploy to a single remote machine. It logs in to your remote
machine via ssh and updates or initializes the docker stack utilizing the same
docker compose file as in development but with production environment variables
provided via github action variables and secrets.

Review the workflow to see which variables and secrets you need to provide.

# Monorepo package convention

This repository utilizes pnpm workspaces to organize and separate concerns. Lower level workspaces pay not depend on higher level workspaces.

These are the workspaces, in order:

## apps

Deployable artifacts. Composes all other packages.

## modules

Concrete game mechanics and business logic.

Should be highly configurable and may not contain hard coded configuration. May do so either by composition, or dependency injection.

Dependencies on other modules must be done via dependency injection (See [@mp/ioc](libraries/ioc/)).

## libraries

Generic and low level systems.

Should be highly configurable and may not contain hard coded configuration or depend on dependency injection.

Dependencies must instead be provided as arguments.
