import type { ReadonlySignal } from "@preact/signals-core";
import { signal } from "@preact/signals-core";

export interface NotifyableSignal<Value>
  extends Pick<ReadonlySignal<Value>, "value"> {
  notify: () => void;
}

export function notifyableSignal<Value>(
  initialValue: Value,
): NotifyableSignal<Value> {
  const value = signal(initialValue);
  const epoch = signal(0);
  return {
    get value() {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      epoch.value; // Add epoch to dependency to ensure signal updates when notified
      return value.value;
    },
    notify: () => {
      epoch.value++;
    },
  };
}

export {
  type ReadonlySignal,
  type Signal,
  signal,
  computed,
  effect,
} from "@preact/signals-core";
