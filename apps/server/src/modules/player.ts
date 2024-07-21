import type { Entity, Vec2 } from "@mp/data";
import { setTemporalTarget, temporal, v2 } from "@mp/data";
import { t } from "../tsock";
import type { ConnectionModule } from "./connection";

export function createPlayerModule(connection: ConnectionModule) {
  connection.$subscribe(({ name, args: [{ context }] }) => {
    const { world } = context;
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
  });

  return t.module({
    move: t.event.payload<Vec2>().create(({ payload, context }) => {
      const { world, time } = context;
      const entity = world.entities.get(context.clientId);
      if (entity) {
        setTemporalTarget(entity.position, payload, time);
      }
    }),
  });
}

function createRandomEntity(clientId: string): Entity {
  const position = v2(Math.random(), Math.random());
  return {
    id: clientId,
    name: clientId,
    position: temporal(position),
    speed: (10 + 10 * Math.random()) / 100,
  };
}
