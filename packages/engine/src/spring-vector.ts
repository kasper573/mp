import { Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import { computed, type ReadonlySignal } from "@mp/state";
import type { SpringLike, SpringOptions } from "./spring";
import { Spring } from "./spring";

export class VectorSpring<T extends number> implements SpringLike<Vector<T>> {
  private xSpring: Spring<T>;
  private ySpring: Spring<T>;
  readonly state: ReadonlySignal<"settled" | "moving">;
  readonly value: ReadonlySignal<Vector<T>>;

  constructor(
    target: ReadonlySignal<Vector<T>>,
    options: () => SpringOptions,
    init?: Vector<T>,
  ) {
    const targetX = computed(() => target.get().x);
    const targetY = computed(() => target.get().y);
    this.xSpring = new Spring(targetX, options, init?.x);
    this.ySpring = new Spring(targetY, options, init?.y);
    this.state = computed(() => {
      return this.xSpring.state.get() === "settled" &&
        this.ySpring.state.get() === "settled"
        ? "settled"
        : "moving";
    });
    this.value = computed(
      () => new Vector(this.xSpring.value.get(), this.ySpring.value.get()),
    );
  }

  update = (dt: TimeSpan) => {
    this.xSpring.update(dt);
    this.ySpring.update(dt);
  };
}
