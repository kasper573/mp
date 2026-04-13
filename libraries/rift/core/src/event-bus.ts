export type UnsubscribeFn = () => void;

// oxlint-disable-next-line typescript/no-explicit-any
export class EventBus<Handler extends (...args: any[]) => void> {
  #handlers = new Set<Handler>();

  emit(...args: Parameters<Handler>): void {
    for (const handler of this.#handlers) {
      handler(...args);
    }
  }

  subscribe(handler: Handler): UnsubscribeFn {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }
}
