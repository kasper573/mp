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
    this.#value.set(init ?? target.get());
    this.state = computed(() => {
      const { precision } = this.options();
      const isSettled =
        Math.abs(target.get() - this.#value.get()) < precision &&
        Math.abs(this.velocity.get()) < precision;

      return isSettled ? "settled" : "moving";
    });
  }

  update = (dt: TimeSpan) => {
    const { stiffness, damping, mass } = this.options();
    const currentTarget = this.target.get();
    const delta = currentTarget - this.#value.get();
    const force = stiffness * delta;
    const dampingForce = -damping * this.velocity.get();
    const acceleration = (force + dampingForce) / mass;

    this.velocity.set(
      (this.velocity.get() + acceleration * dt.totalSeconds) as T,
    );
    this.#value.set(
      (this.#value.get() + this.velocity.get() * dt.totalSeconds) as T,
    );

    if (this.state.get() === "settled") {
      this.#value.set(currentTarget);
      this.velocity.set(0 as T);
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
