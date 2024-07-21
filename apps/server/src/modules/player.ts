import type { Vec2 } from "@mp/data";
import { v2, v2_add, v2_direction, v2_distance, v2_mult } from "@mp/data";
import { clamp } from "@mp/data";
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
  const { position, targetPosition, speed } = entity;

  const distanceRemaining = v2_distance(position, targetPosition);
  const distanceTraversedThisTick = speed * deltaTime;
  const distance = clamp(distanceTraversedThisTick, 0, distanceRemaining);
  if (distance === 0) {
    return;
  }

  entity.position = v2_add(
    entity.position,
    v2_mult(v2_direction(position, targetPosition), distance),
  );
}
