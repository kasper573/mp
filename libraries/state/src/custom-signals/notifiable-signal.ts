import { Signal, signal } from "../signal";

export class NotifiableSignal<T> extends Signal<T> {
  private epoch = signal(0);

  override get value(): T {
    // oxlint-disable-next-line no-unused-expressions
    this.epoch.value; // Add epoch to dependency to ensure signal updates when notified
    return super.value;
  }

  notify() {
    this.epoch.value++;
  }
}
