# game

This package is in practice the entire game. It utilizes all features from `packages/*` to build all game mechanics and contain both client and server side code.

That being said, this package is not really an app, but it resides in this workspace to clarify and help linting enforce that nothing from `packages/*` depends on this package.

The other apps will select the relevant parts from this package and compose them into more specific applications, ie. the [client app](../client/) and the [server app](../server).

## Domain driven organization

This package or organized by domain and allow you to mix client and server side concerns. This makes it easier to understand each domain and to find most of the code relating to a domain, and to visualize how domains depend on each other by inspecting import maps.

However, the package itself still exports two buckets: one for the client and one for the server. This allows for better DX in that the server doesn't restart in development when you modify client-only code, and also lets us finetune what code gets exposed to either the client or server, either for security or technical concerns (technical being ie. not exposing vanilla-extract css to the server, allowing it to not have to be able to parse those files).

So in short: organize by domain, but re-export the relevant code in [package.client.ts](src/package.client.ts) and [package.server.ts](src/package.server.ts).

## Abstract persistence

All database queries and mutations should be abstracted away using a service pattern. The domains in the game package are responsible for defining service interfaces and an [injection context](../../packages/ioc) for each, while the implementation code and service instances will be defined in the [server](../server/) app and passed down to the game via context.
