import type { Entity, Vec2, World } from "@mp/data";
import { v2, v2_moveTowards } from "@mp/data";
import { t } from "../tsock";
import type { ConnectionModule } from "./connection";

export function createPlayerModule(connection: ConnectionModule) {
  const world: World = {
    entities: new Map(),
  };

  connection.$subscribe(({ name, args: [{ context }] }) => {
    switch (name) {
      case "connect": {
        const entity = createRandomEntity(context.clientId);
        world.entities.set(entity.id, entity);
        break;
      }
      case "disconnect":
        world.entities.delete(context.clientId);
        break;
    }

    player.state({ payload: world, context });
  });

  const player = t.module({
    move: t.event.payload<Vec2>().create(({ payload, context }) => {
      const entity = world.entities.get(context.clientId);
      if (entity) {
        entity.targetPosition = payload;
        player.state({ payload: world, context });
      }
    }),

    state: t.event
      .type("server-to-client")
      .payload<World>()
      .create(() => world),

    tick: t.event
      .type("server-only")
      .payload<{ deltaTime: number }>()
      .create(({ payload: { deltaTime } }) => {
        world.entities.forEach((entity) =>
          moveEntityTowardsTarget(entity, deltaTime),
        );
        player.state({ payload: world, context: { clientId: "server" } });
      }),
  });

  return player;
}

function moveEntityTowardsTarget(entity: Entity, deltaTime: number) {
  entity.position = v2_moveTowards(
    entity.position,
    entity.targetPosition,
    entity.speed * deltaTime,
  );
}

function createRandomEntity(clientId: string): Entity {
  const position = v2(Math.random(), Math.random());
  return {
    id: clientId,
    name: clientId,
    position,
    targetPosition: position,
    speed: (10 + 10 * Math.random()) / 100,
  };
}
