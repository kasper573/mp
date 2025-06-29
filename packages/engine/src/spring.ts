import type { ReadonlyAtom } from "@mp/state";
import { atom, computed } from "@mp/state";
import type { TimeSpan } from "@mp/time";

export class Spring<T extends number> implements SpringLike<T> {
  readonly velocity = atom<T>(0 as T);
  readonly #value = atom<T>(0 as T);
  readonly state: ReadonlyAtom<SpringState>;

  get value(): ReadonlyAtom<T> {
    return this.#value;
  }

  constructor(
    public readonly target: () => T,
    private options: () => SpringOptions,
    init?: T,
  ) {
    this.#value.set(init ?? target());
    this.state = computed([this.#value, this.velocity], (value, velocity) => {
      const { precision } = this.options();
      const isSettled =
        Math.abs(this.target() - value) < precision &&
        Math.abs(velocity) < precision;

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
  value: ReadonlyAtom<T>;
  state: ReadonlyAtom<SpringState>;
  update: (dt: TimeSpan) => void;
}
