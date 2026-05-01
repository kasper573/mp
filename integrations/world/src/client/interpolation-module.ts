import { RiftClientModule } from "@rift/core";
import type { Cleanup } from "@rift/module";
import type { CardinalDirection } from "@mp/math";
import { nearestCardinalDirection, Vector } from "@mp/math";
import { Movement } from "../movement/components";
import { moveAlongPath } from "../movement/path";

export interface InterpolationOptions {
  /**
   * Provides delta time per frame in seconds. Wire this up to your renderer's
   * frame ticker (e.g. PIXI ticker) so movement can advance smoothly between
   * server tick updates.
   */
  readonly subscribeToFrames: (
    onFrame: (deltaSeconds: number) => void,
  ) => () => void;

  /**
   * When false, the module is a no-op. Useful for toggling interpolation
   * without unmounting the module.
   */
  readonly enabled: () => boolean;
}

/**
 * Advances actor positions along their server-provided paths between deltas
 * to give a smooth, interpolated motion on the client.
 */
export class InterpolationModule extends RiftClientModule {
  readonly #opts: InterpolationOptions;

  constructor(opts: InterpolationOptions) {
    super();
    this.#opts = opts;
  }

  init(): Cleanup {
    return this.#opts.subscribeToFrames((dt) => this.#step(dt));
  }

  #step(deltaSeconds: number): void {
    if (!this.#opts.enabled()) return;
    const world = this.client.world;
    for (const [id, mv] of world.query(Movement)) {
      if (mv.path.length === 0) continue;
      const updated = moveAlongPath(
        {
          coords: { x: mv.coords.x, y: mv.coords.y },
          speed: mv.speed,
          path: mv.path.map((p) => ({ x: p.x, y: p.y })),
        },
        deltaSeconds,
      );
      const target = updated.path[0];
      let direction: CardinalDirection = mv.direction;
      if (target) {
        direction = nearestCardinalDirection(
          new Vector(updated.coords.x, updated.coords.y).angle(
            new Vector(target.x, target.y),
          ),
        );
      }
      world.set(id, Movement, {
        ...mv,
        coords: updated.coords,
        path: updated.path,
        direction,
      });
    }
  }
}
