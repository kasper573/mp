import type { Vector } from "@mp/math";
import { vec } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import type { Computed } from "@mp/state";
import { batch } from "@mp/state";
import { computed } from "@mp/state";
import type { SpringLike, SpringOptions } from "./spring";
import { Spring } from "./spring";

export class VectorSpring<T extends number> implements SpringLike<Vector<T>> {
  private xSpring: Spring<T>;
  private ySpring: Spring<T>;

  constructor(
    getTargetValue: () => Vector<T>,
    options: () => SpringOptions,
    init?: Vector<T>,
  ) {
    this.xSpring = new Spring(() => getTargetValue().x, options, init?.x);
    this.ySpring = new Spring(() => getTargetValue().y, options, init?.y);
    this.value = computed(() =>
      vec(this.xSpring.value(), this.ySpring.value()),
    );
  }

  readonly value: Computed<Vector<T>>;

  state = () =>
    this.xSpring.state() === "settled" && this.ySpring.state() === "settled"
      ? "settled"
      : "moving";

  update = (dt: TimeSpan) => {
    batch(() => {
      this.xSpring.update(dt);
      this.ySpring.update(dt);
    });
  };
}
