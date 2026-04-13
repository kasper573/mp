# @rift/modular

Module system for building games on top of `@rift/core`. Lets you organize game logic into composable, dependency-aware modules that work on both server and client.

## Key Concepts

- **defineModule** — Declares a module with optional dependencies, a `client` factory, and a `server` factory. Dependencies are automatically resolved and initialized in the correct order.
- **GameServer** — Wires modules to a `RiftServer` and a WebSocket server. Handles the game loop, client connections, and delta broadcasting at a configurable tick rate.
- **GameClient** — Wires modules to a `RiftClient` and a WebSocket connection. Applies incoming state and gives modules access to the DOM for rendering.

## Usage

```ts
import { defineModule } from "@rift/modular";

const HealthModule = defineModule({
  dependencies: [PlayerModule],
  server: (ctx) => {
    // server-side logic with access to rift, other module APIs, etc.
    return {
      api: {
        heal(entity, amount) {
          /* ... */
        },
      },
    };
  },
  client: (ctx) => {
    // client-side rendering logic
    return {};
  },
});
```
