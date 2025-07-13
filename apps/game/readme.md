# game

This package is in practice the entire game. It utilizes all features from `packages/*` to build all game mechanics and contain both client and server side code.

That being said, this package is not really an app, but it resides in this workspace to clarify and help linting enforce that nothing from `packages/*` depends on this package.

The other apps will select the relevant parts from this package and compose them into more specific applications, ie. the [client app](../client/) and the [server app](../server).

## Domain driven organization

This package or organized by domain and allow you to mix client and server side concerns. This makes it easier to understand each domain and to find most of the code relating to a domain, and to visualize how domains depend on each other by inspecting import maps.

While it's recommended to separate client and server concerns into at least separate files, it's not a requiement, since organizing by domain inevitably will blur the lines between client and server and some code will leak across the client server boundary in either direction, and we're fine with that.

Secrets should not exist in code anyway, and we don't care if the client bundle becomes slightly larger if some of the server code ends up in the

## Abstract persistence

All database queries and mutations should be abstracted away using a service pattern. The domains in the game package are responsible for defining service interfaces and an [injection context](../../packages/ioc) for each, while the implementation code and service instances will be defined in the [server](../server/) app and passed down to the game via context.
