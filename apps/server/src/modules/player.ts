import type { Vec2 } from "@mp/data";
import { v2, v2_moveInDirection } from "@mp/data";
import { t } from "../tsock";
import type { ConnectionModule } from "./connection";
import type { Entity } from "./entity";
import type { Scene } from "./scene";

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
      case "connect": {
        const position = v2(Math.random(), Math.random());
        state.currentScene.entities.set(context.clientId, {
          id: context.clientId,
          name: context.clientId,
          position,
          targetPosition: position,
          speed: (10 + 10 * Math.random()) / 100,
        });
        break;
      }
      case "disconnect":
        state.currentScene.entities.delete(context.clientId);
        break;
    }

    player.state({ payload: state, context });
  });

  const player = t.module({
    move: t.event.payload<Vec2>().create(({ payload, context }) => {
      const entity = state.currentScene.entities.get(context.clientId);
      if (entity) {
        entity.targetPosition = payload;
        player.state({ payload: state, context });
      }
    }),
    state: t.event
      .type("server-to-client")
      .payload<PlayerState>()
      .create(() => {
        return state;
      }),

    tick: t.event
      .type("server-only")
      .payload<{ deltaTime: number }>()
      .create(({ payload: { deltaTime } }) => {
        state.currentScene.entities.forEach((entity) =>
          moveEntityTowardsTarget(entity, deltaTime),
        );
        player.state({ payload: state, context: { clientId: "server" } });
      }),
  });

  return player;
}

function moveEntityTowardsTarget(entity: Entity, deltaTime: number) {
  entity.position = v2_moveInDirection(
    entity.position,
    entity.targetPosition,
    entity.speed * deltaTime,
  );
}
