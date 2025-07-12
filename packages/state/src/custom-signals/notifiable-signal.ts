import type { ReadonlySignal } from "../signal";
import { signal } from "../signal";

export interface NotifiableSignal<Value>
  extends Pick<ReadonlySignal<Value>, "value"> {
  notify: () => void;
}

export function notifiableSignal<Value>(
  initialValue: Value,
): NotifiableSignal<Value> {
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
