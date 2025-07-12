import { Signal, signal } from "../signal";

export class NotifiableSignal<T> extends Signal<T> {
  private epoch = signal(0);

  override get value(): T {
    this.epoch.value; // Add epoch to dependency to ensure signal updates when notified
    return super.value;
  }

  notify() {
    this.epoch.value++;
  }
}
