# mp

A retro, point and click, hack and slash online rpg.

This is a pet project that I'm working on over the weekends over at https://www.twitch.tv/kasper_573.

I'm doing this project for fun and to teach myself more about multiplayer game development.

## Stack

- 2d graphics: [Pixi](https://pixijs.com/)
- maps: [Tiled](https://www.mapeditor.org/) (+custom [loader](packages/tiled-loader)/[renderer](packages/tiled-renderer))
- ui: [SolidJS](https://www.solidjs.com/)
- database: [postgres](https://www.postgresql.org/) + [drizzle orm](https://orm.drizzle.team/)
- network: [ws](https://www.npmjs.com/package/ws) and [automerge](https://automerge.org/)
- auth: [clerk](https://clerk.com/)
- metrics: [grafana](https://grafana.com/) + [prometheus](https://prometheus.io/)

## (very loose) Design goals

- CI/CD
- As replicable as possible. Clone and run, containerized deploy.
- [Modular and encapsulated concerns](packages).
- Authorative server
- Dead simple client
  - little to no optimistic operations (maybe some lerping)
  - subscribe to state changes, render them.

## Getting started

- Install [Docker](https://www.docker.com/)
- Clone this repository
- Create `docker/.env.local` and provide the required secrets
- Run `ENV=dev docker compose up --watch`
- Run `./docker/installcert.sh`

## Deploying to production

The github actions workflow is already deployment ready but requires you to configure a few secrets and variables:

Variables:

```
DEPLOY_SSH_HOST
DEPLOY_SSH_USERNAME

# the public domain your deploy target is accessible from
# will be used by reverse proxy to set up all routing
MP_DOMAIN
```

Secrets:

```
DEPLOY_SSH_KEY

# clerk secret and publishable keys
AUTH_SECRET_KEY
AUTH_PUBLISHABLE_KEY
```
