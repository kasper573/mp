import type { Scene } from "../definition";
import { t } from "../definition";
import type { ConnectionModule } from "./connection";
import type { Position } from "./entity";

export interface PlayerState {
  currentScene: Scene;
}

export function createPlayerModule(connection: ConnectionModule) {
  const state: PlayerState = {
    currentScene: {
      entities: new Map(),
    },
  };

  connection.$subscribe(({ name, args: [{ context }] }) => {
    switch (name) {
      case "connect":
        state.currentScene.entities.set(context.clientId, {
          id: context.clientId,
          name: context.clientId,
          position: { x: Math.random(), y: Math.random() },
        });
        break;
      case "disconnect":
        state.currentScene.entities.delete(context.clientId);
        break;
    }

    player.state({ payload: state, context });
  });

  const player = t.module({
    move: t.event.payload<Position>().create(({ payload, context }) => {
      const entity = state.currentScene.entities.get(context.clientId);
      if (entity) {
        entity.position = payload;
        player.state({ payload: state, context });
      }
    }),
    state: t.event
      .origin("server")
      .payload<PlayerState>()
      .create(() => {
        return state;
      }),
  });

  return player;
}
