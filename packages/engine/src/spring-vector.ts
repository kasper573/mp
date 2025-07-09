import { Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import type { ReadonlyObservable } from "@mp/state";
import type { SpringLike, SpringOptions } from "./spring";
import { Spring } from "./spring";

export class VectorSpring<T extends number> implements SpringLike<Vector<T>> {
  private xSpring: Spring<T>;
  private ySpring: Spring<T>;
  readonly state: ReadonlyObservable<"settled" | "moving">;
  readonly value: ReadonlyObservable<Vector<T>>;

  constructor(
    target: ReadonlyObservable<Vector<T>>,
    options: () => SpringOptions,
    init?: Vector<T>,
  ) {
    const targetX = target.derive((v) => v.x);
    const targetY = target.derive((v) => v.y);
    this.xSpring = new Spring(targetX, options, init?.x);
    this.ySpring = new Spring(targetY, options, init?.y);
    this.state = this.xSpring.state
      .compose(this.ySpring.state)
      .derive(([xState, yState]) =>
        xState === "settled" && yState === "settled" ? "settled" : "moving",
      );
    this.value = this.xSpring.value
      .compose(this.ySpring.value)
      .derive(([x, y]) => new Vector(x, y));
  }

  update = (dt: TimeSpan) => {
    this.xSpring.update(dt);
    this.ySpring.update(dt);
  };
}
