import {
  createSignal as solidCreateSignal,
  untrack as solidUntrack,
  type Accessor,
  type Setter,
} from "solid-js";

export interface ReadonlySignal<T> {
  readonly get: () => T;
  subscribe(fn: (value: T) => void): () => void;
}

// Interface for signals that can be tracked by the effect system
export interface TrackableSignal {
  removeEffect(ctx: EffectContext): void;
}

// Effect tracking for synchronous reactivity
export interface EffectContext {
  fn: () => void | (() => void);
  cleanup: (() => void) | void;
  signals: Set<TrackableSignal>;
}

let currentEffect: EffectContext | null = null;

// Export functions to get/set the current effect context for use by other signal implementations
export function getCurrentEffect(): EffectContext | null {
  return currentEffect;
}

export function setCurrentEffect(ctx: EffectContext | null): void {
  currentEffect = ctx;
}

export class Signal<T> implements ReadonlySignal<T>, TrackableSignal {
  #accessor: Accessor<T>;
  #setter: Setter<T>;
  #effects = new Set<EffectContext>();

  constructor(initialValue: T) {
    // Create SolidJS signal directly - signals don't require an owner context
    const [accessor, setter] = solidCreateSignal<T>(initialValue);
    this.#accessor = accessor;
    this.#setter = setter;
  }

  get(): T {
    // Track this signal as a dependency of the current effect
    if (currentEffect) {
      currentEffect.signals.add(this);
      this.#effects.add(currentEffect);
    }
    return this.#accessor();
  }

  set(value: T | ((prev: T) => T)): void {
    if (typeof value === "function") {
      this.#setter(value as (prev: T) => T);
    } else {
      // Pass value directly - don't wrap in function as SolidJS would treat that as functional update
      // oxlint-disable-next-line typescript-eslint/no-unsafe-function-type -- needed for generic Signal type
      this.#setter(value as Exclude<T, Function>);
    }
    // Notify all effects synchronously
    this.#notifyEffects();
  }

  #notifyEffects(): void {
    for (const ctx of this.#effects) {
      // Run cleanup if exists
      if (typeof ctx.cleanup === "function") {
        ctx.cleanup();
      }
      // Re-run the effect with tracking enabled so new dependencies are captured
      currentEffect = ctx;
      try {
        ctx.cleanup = ctx.fn();
      } finally {
        currentEffect = null;
      }
    }
  }

  removeEffect(ctx: EffectContext): void {
    this.#effects.delete(ctx);
  }

  subscribe(fn: (value: T) => void): () => void {
    // Use our custom effect system for subscriptions
    return effect(() => {
      fn(this.get());
    });
  }
}

export class Computed<T> implements ReadonlySignal<T> {
  private fn: () => T;

  constructor(fn: () => T) {
    this.fn = fn;
  }

  get(): T {
    // Call the function directly - reactive contexts that call get()
    // will track the underlying signal reads
    return this.fn();
  }

  subscribe(fn: (value: T) => void): () => void {
    // Use our custom effect system for subscriptions
    // This avoids potential issues with createRoot isolation
    return effect(() => {
      fn(this.get());
    });
  }
}

export function signal<T>(initialValue: T): Signal<T> {
  return new Signal(initialValue);
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  return new Computed(fn);
}

export function effect(fn: () => void | (() => void)): () => void {
  const ctx: EffectContext = {
    fn,
    cleanup: undefined,
    signals: new Set(),
  };

  // Run the effect initially, tracking dependencies
  currentEffect = ctx;
  try {
    ctx.cleanup = fn();
  } finally {
    currentEffect = null;
  }

  return () => {
    // Run cleanup
    if (typeof ctx.cleanup === "function") {
      ctx.cleanup();
    }
    // Remove this effect from all signals
    for (const sig of ctx.signals) {
      sig.removeEffect(ctx);
    }
    ctx.signals.clear();
  };
}

export function untracked<T>(fn: () => T): T {
  return solidUntrack(fn);
}
