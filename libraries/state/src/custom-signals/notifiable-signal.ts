import type { ReadonlySignal, TrackableSignal, EffectContext } from "../signal";
import { effect, getCurrentEffect, setCurrentEffect } from "../signal";

export class NotifiableSignal<T> implements ReadonlySignal<T>, TrackableSignal {
  #value: T;
  #effects = new Set<EffectContext>();

  constructor(initialValue: T) {
    this.#value = initialValue;
  }

  get(): T {
    // Track this signal as a dependency of the current effect
    const currentEffect = getCurrentEffect();
    if (currentEffect) {
      currentEffect.signals.add(this);
      this.#effects.add(currentEffect);
    }
    return this.#value;
  }

  set(value: T): void {
    this.#value = value;
  }

  notify(): void {
    // Notify all effects synchronously
    for (const ctx of this.#effects) {
      // Run cleanup if exists
      if (typeof ctx.cleanup === "function") {
        ctx.cleanup();
      }
      // Re-run the effect with tracking enabled so new dependencies are captured
      setCurrentEffect(ctx);
      try {
        ctx.cleanup = ctx.fn();
      } finally {
        setCurrentEffect(null);
      }
    }
  }

  removeEffect(ctx: EffectContext): void {
    this.#effects.delete(ctx);
  }

  subscribe(fn: (value: T) => void): () => void {
    return effect(() => {
      fn(this.get());
    });
  }
}
