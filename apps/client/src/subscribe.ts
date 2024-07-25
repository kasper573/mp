export function subscribe<
  EventName extends string,
  EventHandlers extends Record<EventName, (...args: never[]) => void>,
  EventTrigger extends {
    on: <E extends EventName>(
      eventName: E,
      eventHandler: EventHandlers[E],
    ) => void;
    off: <E extends EventName>(
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
