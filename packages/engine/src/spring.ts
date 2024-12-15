import type { Atom, Computed } from "@mp/state";
import { atom, batch, computed } from "@mp/state";
import type { TimeSpan } from "@mp/time";

export class Spring implements SpringLike<number> {
  readonly velocity: Atom<number> = atom(0);
  readonly #value: Atom<number> = atom(0);
  readonly state: Computed<SpringState>;

  value = (): number => this.#value.get();

  constructor(
    public readonly target: () => number,
    private options: () => SpringOptions,
    init?: number,
  ) {
    this.#value.set(init ?? target());
    this.state = computed(() => {
      const { precision } = this.options();
      const isSettled =
        Math.abs(this.target() - this.#value.get()) < precision &&
        Math.abs(this.velocity.get()) < precision;

      return isSettled ? "settled" : "moving";
    });
  }

  update = (dt: TimeSpan): void => {
    const { stiffness, damping, mass } = this.options();
    const currentTarget = this.target();
    const delta = currentTarget - this.#value.get();
    const force = stiffness * delta;
    const dampingForce = -damping * this.velocity.get();
    const acceleration = (force + dampingForce) / mass;

    batch(() => {
      this.velocity.set((prev) => prev + acceleration * dt.totalSeconds);
      this.#value.set((prev) => prev + this.velocity.get() * dt.totalSeconds);

      if (this.state() === "settled") {
        this.#value.set(currentTarget);
        this.velocity.set(0);
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
