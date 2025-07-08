import type { ReadonlyObservable } from "@mp/state";
import { mutableObservable } from "@mp/state";
import type { TimeSpan } from "@mp/time";

export class Spring<T extends number> implements SpringLike<T> {
  readonly velocity = mutableObservable<T>(0 as T);
  readonly #value = mutableObservable<T>(0 as T);
  readonly state: ReadonlyObservable<SpringState>;

  get value(): ReadonlyObservable<T> {
    return this.#value;
  }

  constructor(
    public readonly target: ReadonlyObservable<T>,
    private options: () => SpringOptions,
    init?: T,
  ) {
    this.#value.set(init ?? target.$getObservableValue());
    this.state = this.#value
      .compose(this.velocity, target)
      .derive(([value, velocity, target]) => {
        const { precision } = this.options();
        const isSettled =
          Math.abs(target - value) < precision &&
          Math.abs(velocity) < precision;

        return isSettled ? "settled" : "moving";
      });
  }

  update = (dt: TimeSpan) => {
    const { stiffness, damping, mass } = this.options();
    const currentTarget = this.target.$getObservableValue();
    const delta = currentTarget - this.#value.$getObservableValue();
    const force = stiffness * delta;
    const dampingForce = -damping * this.velocity.$getObservableValue();
    const acceleration = (force + dampingForce) / mass;

    this.velocity.set(
      (this.velocity.$getObservableValue() +
        acceleration * dt.totalSeconds) as T,
    );
    this.#value.set(
      (this.#value.$getObservableValue() +
        this.velocity.$getObservableValue() * dt.totalSeconds) as T,
    );

    if (this.state.$getObservableValue() === "settled") {
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
  value: ReadonlyObservable<T>;
  state: ReadonlyObservable<SpringState>;
  update: (dt: TimeSpan) => void;
}
