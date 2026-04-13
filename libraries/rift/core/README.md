# @rift/core

Core ECS library for TypeScript. Provides the fundamental building blocks for managing game state with binary serialization and delta sync.

## Key Concepts

- **RiftWorld** — Declares the schema of your game by registering component and event types. Shared between server and client to ensure both sides agree on the data layout.
- **RiftServer** — Server-side world manager. Owns the authoritative state, creates/destroys entities, sets components, fires events, and produces binary deltas to send to clients.
- **RiftClient** — Client-side world manager. Applies incoming binary deltas to reconstruct the current state and exposes the same query API for rendering.
- **Entity** — A lightweight numeric ID that components are attached to.
- **RiftType** — A schema definition (using binary field descriptors) for a component or event. Used for both type-safe access and automatic serialization.
- **Query** — Reactive query that watches entities matching a given set of component types.

## Usage

```ts
import { RiftWorld, RiftServer, RiftClient } from "@rift/core";

const world = new RiftWorld({
  components: [Position, Health],
  events: [DamageEvent],
});

// Server
const server = new RiftServer(world);
const entity = server.spawn();
server.set(entity, Position, { x: 0, y: 0 });

// Client
const client = new RiftClient(world);
client.apply(deltaFromServer);
```
