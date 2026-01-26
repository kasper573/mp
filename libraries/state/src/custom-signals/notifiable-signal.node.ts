/// <reference path="../global.d.ts" />
// Node.js version of notifiable-signal.ts that uses solid-js browser build
import { createSignal, untrack } from "solid-js/dist/solid";
import { Signal } from "../signal.node";

export class NotifiableSignal<T> extends Signal<T> {
  // Use raw createSignal for the epoch to ensure proper tracking
  private epochAccessor: () => number;
  private epochSetter: (n: number) => void;

  constructor(initialValue: T) {
    super(initialValue);
    const [get, set] = createSignal(0);
    this.epochAccessor = get;
    this.epochSetter = set;
  }

  override get(): T {
    // Track the epoch - this should trigger re-runs when notify() is called
    this.epochAccessor();
    return super.get();
  }

  notify(): void {
    // Increment epoch without tracking to avoid circular dependencies
    this.epochSetter(untrack(this.epochAccessor) + 1);
  }
}
