/**
 * The sync event represents events that have occurred within the same timing window as some state being modified.
 * It is intended to be used to determine why something has changed, but is delivered alongside its related patch
 * in the same sync message to ensure as deterministic behavior as possible.
 */
export type SyncEvent = [name: string, payload?: unknown];

export type SyncEventHandler<Payload> = (payload: Payload) => unknown;

/**
 * Key: event name,
 * Value: payload type
 */
export type SyncEventMap = Record<string, unknown>;

export class SyncEventBus<EventMap extends SyncEventMap> {
  private eventHandlers = new Map<
    keyof EventMap,
    Set<SyncEventHandler<never>>
  >();

  subscribe<EventName extends keyof EventMap>(
    eventName: EventName,
    handler: SyncEventHandler<EventMap[EventName]>,
  ): () => void {
    let handlersForEvent = this.eventHandlers.get(eventName);
    if (!handlersForEvent) {
      handlersForEvent = new Set();
      this.eventHandlers.set(eventName, handlersForEvent);
    }
    handlersForEvent.add(handler);
    return () => handlersForEvent.delete(handler);
  }

  dispatch([eventName, payload]: SyncEvent) {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload as never);
      }
    }
  }
}

export interface EventAccessFn<EventMap extends SyncEventMap> {
  /**
   * Peek into the current event list and select all the events of the given type.
   * Useful if you want to react to events that have occurred since the last flush without performing a flush.
   */
  <EventName extends keyof EventMap>(
    name: EventName,
  ): Array<EventMap[EventName]>;
}
