import type { EntityId, RiftClient } from "@rift/core";
import { Attacked, Died } from "@mp/world";

export interface ClientGameEvents {
  readonly "actor.attack": { readonly entityId: EntityId };
  readonly "actor.death": { readonly entityId: EntityId };
}

export type ClientGameEventName = keyof ClientGameEvents;

export class ClientEventBus {
  readonly #client: RiftClient;
  constructor(client: RiftClient) {
    this.#client = client;
  }

  subscribe<E extends ClientGameEventName>(
    name: E,
    handler: (data: ClientGameEvents[E]) => void,
  ): () => void {
    switch (name) {
      case "actor.attack":
        return this.#client.on(Attacked, (ev) =>
          handler({ entityId: ev.data.entityId } as ClientGameEvents[E]),
        );
      case "actor.death":
        return this.#client.on(Died, (ev) =>
          handler({ entityId: ev.data.entityId } as ClientGameEvents[E]),
        );
      default: {
        const _exhaustive: never = name;
        return () => {
          void _exhaustive;
        };
      }
    }
  }
}
