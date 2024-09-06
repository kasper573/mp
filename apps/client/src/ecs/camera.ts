import type { Vector } from "@mp/math";
import type { Container } from "@mp/pixi";
import type { TimeSpan } from "@mp/state";

export class Camera {
  target?: Vector;

  constructor(
    private viewport: Container,
    friction: number = 0.1,
    bounce: number = 0.2,
    minSpeed: number = 0.05,
  ) {}

  update(delta: TimeSpan): void {}
}
