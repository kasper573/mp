import type { Computed } from "@mp/state";
import { atom, computed, batch } from "@mp/state";
import type { TimeSpan } from "@mp/time";

export class Spring<T extends number> implements SpringLike<T> {
  readonly velocity = atom<T>(0 as T);
  readonly #value = atom<T>(0 as T);
  readonly state: Computed<SpringState>;

  value = () => this.#value.get();

  constructor(
    public readonly target: () => T,
    private options: () => SpringOptions,
    init?: T,
  ) {
    this.#value.set(() => init ?? target());
    this.state = computed(() => {
      const { precision } = this.options();
      const isSettled =
        Math.abs(this.target() - this.#value.get()) < precision &&
        Math.abs(this.velocity.get()) < precision;

      return isSettled ? "settled" : "moving";
    });
  }

  update = (dt: TimeSpan) => {
    const { stiffness, damping, mass } = this.options();
    const currentTarget = this.target();
    const delta = currentTarget - this.#value.get();
    const force = stiffness * delta;
    const dampingForce = -damping * this.velocity.get();
    const acceleration = (force + dampingForce) / mass;

    batch(() => {
      this.velocity.set((prev) => (prev + acceleration * dt.totalSeconds) as T);
      this.#value.set(
        (prev) => (prev + this.velocity.get() * dt.totalSeconds) as T,
      );

      if (this.state() === "settled") {
        this.#value.set(() => currentTarget);
        this.velocity.set(() => 0 as T);
      }
    });
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
  value: () => T;
  state: () => SpringState;
  update: (dt: TimeSpan) => void;
}
