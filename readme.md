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

The rest is custom.

## (very loose) Design goals

- CI/CD
- As replicable as possible. Clone and run, containerized deploy.
- [Ridiculously modular](packages). What can i say, I like separation of concerns.
- Authorative server
- Dead simple client
  - little to no optimistic operations (maybe some lerping)
  - subscribe to state changes, render them.

## Getting started

- Install Node 20+
- Clone this repository
- Run `corepack enable`
- Run `pnpm install`
- Copy `.env-example` > `.env` and update its values
- Run `pnpm dev`
