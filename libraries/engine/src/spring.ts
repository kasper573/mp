import type { ReadonlySignal } from "@mp/state";
import { computed, signal } from "@mp/state";
import type { TimeSpan } from "@mp/time";

export class Spring<T extends number> implements SpringLike<T> {
  readonly velocity = signal<T>(0 as T);
  readonly #value = signal<T>(0 as T);
  readonly state: ReadonlySignal<SpringState>;

  get value(): ReadonlySignal<T> {
    return this.#value;
  }

  constructor(
    public readonly target: ReadonlySignal<T>,
    private options: () => SpringOptions,
    init?: T,
  ) {
    this.#value.value = init ?? target.value;
    this.state = computed(() => {
      const { precision } = this.options();
      const isSettled =
        Math.abs(target.value - this.#value.value) < precision &&
        Math.abs(this.velocity.value) < precision;

      return isSettled ? "settled" : "moving";
    });
  }

  update = (dt: TimeSpan) => {
    const { stiffness, damping, mass } = this.options();
    const currentTarget = this.target.value;
    const delta = currentTarget - this.#value.value;
    const force = stiffness * delta;
    const dampingForce = -damping * this.velocity.value;
    const acceleration = (force + dampingForce) / mass;

    this.velocity.value = (this.velocity.value +
      acceleration * dt.totalSeconds) as T;

    this.#value.value = (this.#value.value +
      this.velocity.value * dt.totalSeconds) as T;

    if (this.state.value === "settled") {
      this.#value.value = currentTarget;
      this.velocity.value = 0 as T;
    }
  };
}

export interface SpringOptions {
  damping: number;
  precision: number;
  mass: number;
  stiffness: number;
}

export type SpringState = "settled" | "moving";

export interface SpringLike<T> {
  value: ReadonlySignal<T>;
  state: ReadonlySignal<SpringState>;
  update: (dt: TimeSpan) => void;
}
