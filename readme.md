# mp

A retro, point and click, hack and slash online rpg.

This is a pet project that I'm working on over the weekends over at
https://www.twitch.tv/kasper_573.

I'm doing this project for fun and to teach myself more about multiplayer game
development.

## Stack

- 2d graphics: [Pixi](https://pixijs.com/)
- maps: [Tiled](https://www.mapeditor.org/) (+custom
  [loader](packages/tiled-loader)/[renderer](packages/tiled-renderer))
- ui: [SolidJS](https://www.solidjs.com/)
- database: [postgres](https://www.postgresql.org/) +
  [drizzle orm](https://orm.drizzle.team/)
- network: [ws](https://www.npmjs.com/package/ws) and
  [automerge](https://automerge.org/)
- auth: [keycloak](https://www.keycloak.org/)
- metrics: [grafana](https://grafana.com/) +
  [prometheus](https://prometheus.io/)

## (very loose) Design goals

- CI/CD
- As replicable as possible. Clone and run, containerized deploy.
- [Modular and encapsulated concerns](packages).
- Authorative server
- Dead simple client
  - little to no optimistic operations (maybe some lerping)
  - subscribe to state changes, render them.

## Development

- Install [Docker](https://www.docker.com/)
- Install [NodeJS](https://nodejs.org/)
- Clone this repository
- Run `./docker/dockerctl.sh dev up -d`
- Enable and prepare [corepack](https://nodejs.org/docs/v22.12.0/api/corepack.html#corepack) for this repo
- Run `pnpm install`
- Run `pnpm dev`
- Run `./docker/installcert.sh`
  > You may need to add the root certificate manually to your browser depending
  > on which browser you are using.
- Visit `https://mp.localhost` in your browser

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
