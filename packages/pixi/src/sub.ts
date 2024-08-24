import type { CleanupFn } from "./cleanup";

export function sub<
  EventHandlers extends AnyEventHandlers,
  EventName extends keyof EventHandlers,
>(
  trigger: TriggerLike<EventHandlers>,
  event: EventName,
  callback: EventHandlers[EventName],
): CleanupFn {
  trigger.on(event, callback);
  return () => trigger.off(event, callback);
}

type AnyEventHandlers = Record<string, (...args: never[]) => void>;

interface TriggerLike<EventHandlers extends AnyEventHandlers> {
  on<EventName extends keyof EventHandlers>(
    name: EventName,
    handler: EventHandlers[EventName],
  ): void;
  off<EventName extends keyof EventHandlers>(
    name: EventName,
    handler: EventHandlers[EventName],
  ): void;
}
