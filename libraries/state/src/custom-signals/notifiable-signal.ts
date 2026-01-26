import { Signal, signal } from "../signal";

export class NotifiableSignal<T> extends Signal<T> {
  private epoch = signal(0);

  override get(): T {
    // oxlint-disable-next-line no-unused-expressions
    this.epoch.get(); // Add epoch to dependency to ensure signal updates when notified
    return super.get();
  }

  notify() {
    this.epoch.write(this.epoch.peek() + 1);
  }
}
