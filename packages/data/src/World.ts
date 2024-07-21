import type { Entity } from "./Entity";
import { updateTemporal } from "./Temporal";
import { v2_equals, v2_moveTowards } from "./Vec2";

export interface World {
  entities: Map<Entity["id"], Entity>;
}

export function updateWorld(world: World, time: Date): void {
  for (const entity of world.entities.values()) {
    updateTemporal(entity.position, time, {
      equals: v2_equals,
      update: (pos, target, deltaTime) =>
        v2_moveTowards(pos, target, entity.speed * deltaTime),
    });
  }
}

export function derivePlayerState(world: World, clientId: Entity["id"]): World {
  return world;
}
