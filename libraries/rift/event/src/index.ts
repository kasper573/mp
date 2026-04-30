import type { RiftType } from "@rift/types";

// oxlint-disable-next-line typescript/no-explicit-any
export type AnyEventHandler = EventHandler<any, any, any>;

export type EventHandler<Data, Source, Target> = (
  event: RiftEvent<Data, Source, Target>,
) => unknown;

export type UnsubscribeFn = () => void;

export interface RiftEvent<Data, Source, Target> {
  readonly type: RiftType<Data>;
  readonly data: NoInfer<Data>;
  readonly source: Source;
  readonly target: Target;
}

export class EventBus<Source, Target> {
  readonly #typeHandlers = new Map<RiftType, Set<AnyEventHandler>>();
  readonly #anyHandlers = new Set<AnyEventHandler>();

  on<Data>(
    type: RiftType<Data>,
    handler: EventHandler<Data, Source, Target>,
  ): UnsubscribeFn {
    let set = this.#typeHandlers.get(type);
    if (!set) {
      set = new Set();
      this.#typeHandlers.set(type, set);
    }
    set.add(handler);
    return function unsubscribe() {
      set?.delete(handler);
    };
  }

  onAny(handler: EventHandler<unknown, Source, Target>): UnsubscribeFn {
    this.#anyHandlers.add(handler);
    return () => this.#anyHandlers.delete(handler);
  }

  emit<Data>(event: RiftEvent<Data, Source, Target>): void {
    const set = this.#typeHandlers.get(event.type);
    if (set) {
      for (const handler of set) {
        handler(event);
      }
    }
    for (const handler of this.#anyHandlers) {
      handler(event);
    }
  }
}
