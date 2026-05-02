import { RiftClientModule } from "@rift/core";
import type { Cleanup } from "@rift/module";
import { Vector, cardinalDirectionAngles } from "@mp/math";
import type { Tile } from "@mp/std";
import { Movement } from "../movement/components";

export interface InterpolationOptions {
  readonly subscribeToFrames: (
    onFrame: (deltaSeconds: number) => void,
  ) => () => void;
  readonly enabled: () => boolean;
}

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
      const target = mv.moveTarget;
      if (!target) continue;
      const remaining = mv.coords.distance(target);
      if (remaining === 0) continue;
      const step = mv.speed * deltaSeconds;
      let coords;
      if (step >= remaining) {
        coords = target;
      } else {
        const angle = cardinalDirectionAngles[mv.direction];
        coords = new Vector(
          (mv.coords.x + Math.cos(angle) * step) as Tile,
          (mv.coords.y + Math.sin(angle) * step) as Tile,
        );
      }
      world.set(id, Movement, { ...mv, coords });
    }
  }
}
