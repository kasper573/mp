/**
 * Custom reactive signal implementation that works in both Node.js and browser environments.
 *
 * This implementation provides a consistent reactive system that works everywhere.
 * It integrates with SolidJS when available in browser context to trigger component updates.
 */

import {
  createSignal as solidCreateSignal,
  createMemo as solidCreateMemo,
  createEffect as solidCreateEffect,
  createRoot as solidCreateRoot,
  untrack as solidUntrack,
} from "solid-js";

// Detect if we're in a browser environment where SolidJS reactivity should work
// In Node.js with SolidJS server build, reactivity is intentionally disabled
// In browser with vite-plugin-solid, reactivity is fully enabled
//
// We detect browser context because:
// 1. Browser: window exists, SolidJS reactivity works
// 2. Node.js: window doesn't exist, SolidJS server build disables reactivity
const useSolidJS =
  typeof globalThis !== "undefined" &&
  "window" in globalThis &&
  typeof (globalThis as { window?: unknown }).window !== "undefined";

export interface ReadonlySignal<T> {
  get(): T;
  subscribe(fn: (value: T) => void): () => void;
}

export interface WritableSignal<T> extends ReadonlySignal<T> {
  write(value: T): void;
  peek(): T;
}

// Global context for tracking dependencies during computation (used when SolidJS is not available)
let currentSubscriber: (() => void) | null = null;

// Custom Signal implementation for when SolidJS reactivity is not available
class CustomSignal<T> implements WritableSignal<T> {
  #value: T;
  #subscribers = new Set<() => void>();

  constructor(initialValue: T) {
    this.#value = initialValue;
  }

  get(): T {
    // Track this signal as a dependency if we're inside a computation
    if (currentSubscriber) {
      this.#subscribers.add(currentSubscriber);
    }
    return this.#value;
  }

  write(value: T): void {
    if (!Object.is(this.#value, value)) {
      this.#value = value;
      this.#notify();
    }
  }

  peek(): T {
    return this.#value;
  }

  subscribe(fn: (value: T) => void): () => void {
    // Create an effect that calls fn with the current value
    const dispose = effect(() => {
      fn(this.get());
    });
    return dispose;
  }

  #notify(): void {
    // Copy subscribers to avoid issues if the set is modified during iteration
    const subs = Array.from(this.#subscribers);
    for (const subscriber of subs) {
      subscriber();
    }
  }
}

// SolidJS-based Signal implementation for when reactivity is available
class SolidSignal<T> implements WritableSignal<T> {
  #accessor: () => T;
  #setter: (value: T) => void;

  constructor(initialValue: T) {
    const [accessor, setter] = solidCreateSignal(initialValue);
    this.#accessor = accessor;
    this.#setter = setter as (value: T) => void;
  }

  get(): T {
    return this.#accessor();
  }

  write(value: T): void {
    this.#setter(value);
  }

  peek(): T {
    return solidUntrack(() => this.#accessor());
  }

  subscribe(fn: (value: T) => void): () => void {
    let dispose: (() => void) | undefined;
    solidCreateRoot((d) => {
      dispose = d;
      solidCreateEffect(() => {
        fn(this.#accessor());
      });
    });
    return () => dispose?.();
  }
}

// Export the Signal class - picks the right implementation based on environment
export const Signal: new <T>(initialValue: T) => WritableSignal<T> = useSolidJS
  ? SolidSignal
  : CustomSignal;

// Re-export as a type for convenience
export type Signal<T> = WritableSignal<T>;

export function signal<T>(initialValue: T): WritableSignal<T> {
  return new Signal(initialValue);
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  // Use SolidJS memo if available
  if (useSolidJS) {
    let memo!: () => T;

    solidCreateRoot(() => {
      memo = solidCreateMemo(fn);
    });

    return {
      get: () => memo(),
      subscribe(callback: (value: T) => void): () => void {
        let effectDispose: (() => void) | undefined;
        solidCreateRoot((d) => {
          effectDispose = d;
          solidCreateEffect(() => {
            callback(memo());
          });
        });
        return () => effectDispose?.();
      },
    };
  }

  // Custom implementation
  let cachedValue: T;
  let isStale = true;
  const subscribers = new Set<() => void>();

  // The recompute function that gets registered as a dependency
  const recompute = () => {
    isStale = true;
    // Notify our subscribers that we changed
    const subs = Array.from(subscribers);
    for (const subscriber of subs) {
      subscriber();
    }
  };

  const getValue = (): T => {
    // Track this computed as a dependency if we're inside another computation
    if (currentSubscriber) {
      subscribers.add(currentSubscriber);
    }

    if (isStale) {
      // Track dependencies during computation
      const previousSubscriber = currentSubscriber;
      currentSubscriber = recompute;
      try {
        cachedValue = fn();
      } finally {
        currentSubscriber = previousSubscriber;
      }
      isStale = false;
    }

    return cachedValue;
  };

  // Compute initial value
  getValue();

  return {
    get: getValue,
    subscribe(callback: (value: T) => void): () => void {
      const dispose = effect(() => {
        callback(getValue());
      });
      return dispose;
    },
  };
}

export function effect(fn: () => void): () => void {
  // Use SolidJS effect if available
  if (useSolidJS) {
    let dispose: (() => void) | undefined;
    solidCreateRoot((d) => {
      dispose = d;
      solidCreateEffect(fn);
    });
    return () => dispose?.();
  }

  // Custom implementation
  let isDisposed = false;

  const runEffect = () => {
    if (isDisposed) return;

    // Track dependencies during effect execution
    const previousSubscriber = currentSubscriber;
    currentSubscriber = runEffect;
    try {
      fn();
    } finally {
      currentSubscriber = previousSubscriber;
    }
  };

  // Run effect immediately
  runEffect();

  // Return dispose function
  return () => {
    isDisposed = true;
  };
}

export function untracked<T>(fn: () => T): T {
  if (useSolidJS) {
    return solidUntrack(fn);
  }

  const previousSubscriber = currentSubscriber;
  currentSubscriber = null;
  try {
    return fn();
  } finally {
    currentSubscriber = previousSubscriber;
  }
}
