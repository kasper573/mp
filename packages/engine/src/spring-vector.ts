import { Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import type { ReadonlyAtom } from "@mp/state";
import { computed } from "@mp/state";
import type { SpringLike, SpringOptions } from "./spring";
import { Spring } from "./spring";

export class VectorSpring<T extends number> implements SpringLike<Vector<T>> {
  private xSpring: Spring<T>;
  private ySpring: Spring<T>;
  readonly state: ReadonlyAtom<"settled" | "moving">;
  readonly value: ReadonlyAtom<Vector<T>>;

  constructor(
    getTargetValue: () => Vector<T>,
    options: () => SpringOptions,
    init?: Vector<T>,
  ) {
    this.xSpring = new Spring(() => getTargetValue().x, options, init?.x);
    this.ySpring = new Spring(() => getTargetValue().y, options, init?.y);
    this.state = computed(
      [this.xSpring.state, this.ySpring.state],
      (xState, yState) =>
        xState === "settled" && yState === "settled" ? "settled" : "moving",
    );
    this.value = computed(
      [this.xSpring.value, this.ySpring.value],
      (x, y) => new Vector(x, y),
    );
  }

  update = (dt: TimeSpan) => {
    this.xSpring.update(dt);
    this.ySpring.update(dt);
  };
}
