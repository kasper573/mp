export function subscribe<
  EventName extends string,
  EventHandlers extends AnyEvents,
  EventTrigger extends {
    on: <E extends keyof EventHandlers>(
      eventName: E,
      eventHandler: EventHandlers[E],
    ) => void;
    off: <E extends keyof EventHandlers>(
      eventName: E,
      eventHandler: EventHandlers[E],
    ) => void;
  },
>(
  trigger: EventTrigger,
  eventName: EventName,
  eventHandler: EventHandlers[EventName],
): () => void {
  trigger.on(eventName, eventHandler);
  return () => trigger.off(eventName, eventHandler);
}

type AnyEvents = Record<string, (...args: unknown[]) => void>;
