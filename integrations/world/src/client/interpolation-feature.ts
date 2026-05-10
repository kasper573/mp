import type { Feature } from "@rift/feature";
import { Vector, cardinalDirectionAngles } from "@mp/math";
import { combine, type Tile } from "@mp/std";
import type { EntityId } from "@rift/core";
import { Movement } from "../movement/components";

export interface InterpolationOptions {
  readonly subscribeToFrames: (
    onFrame: (deltaSeconds: number) => void,
  ) => () => void;
  readonly enabled: () => boolean;
}

export class InterpolationLayer {
  readonly #displayCoords = new Map<EntityId, Vector<Tile>>();

  get(id: EntityId): Vector<Tile> | undefined {
    return this.#displayCoords.get(id);
  }

  set(id: EntityId, coords: Vector<Tile>): void {
    this.#displayCoords.set(id, coords);
  }

  delete(id: EntityId): void {
    this.#displayCoords.delete(id);
  }

  clear(): void {
    this.#displayCoords.clear();
  }
}

export function interpolationFeature(
  layer: InterpolationLayer,
  opts: InterpolationOptions,
): Feature {
  return {
    client(client) {
      const offFrame = opts.subscribeToFrames((dt) => {
        if (!opts.enabled()) return;
        for (const [id, mv] of client.world.query(Movement)) {
          const target = mv.moveTarget;
          if (!target) {
            layer.set(id, mv.coords);
            continue;
          }
          const current = layer.get(id) ?? mv.coords;
          const remaining = current.distance(target);
          if (remaining === 0) {
            layer.set(id, target);
            continue;
          }
          const step = mv.speed * dt;
          if (step >= remaining) {
            layer.set(id, target);
          } else {
            const angle = cardinalDirectionAngles[mv.direction];
            layer.set(
              id,
              new Vector(
                (current.x + Math.cos(angle) * step) as Tile,
                (current.y + Math.sin(angle) * step) as Tile,
              ),
            );
          }
        }
      });
      return combine(offFrame, () => layer.clear());
    },
  };
}
