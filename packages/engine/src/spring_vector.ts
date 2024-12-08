import type { Vector } from "@mp/math";
import { vec } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import type { Computed } from "@mp/state";
import { batch } from "@mp/state";
import { computed } from "@mp/state";
import type { SpringLike, SpringOptions } from "./spring.ts";
import { Spring } from "./spring.ts";

export class VectorSpring implements SpringLike<Vector> {
  private xSpring: Spring;
  private ySpring: Spring;

  constructor(
    getTargetValue: () => Vector,
    options: () => SpringOptions,
    init?: Vector
  ) {
    this.xSpring = new Spring(() => getTargetValue().x, options, init?.x);
    this.ySpring = new Spring(() => getTargetValue().y, options, init?.y);
    this.value = computed(() =>
      vec(this.xSpring.value(), this.ySpring.value())
    );
  }

  readonly value: Computed<Vector>;

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
