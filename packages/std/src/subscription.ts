export function subscribeToEventListener<
  const Target extends EventTargetLike,
  const EventType extends keyof inferEventMap<Target>,
  const Listener extends inferEventMap<Target>[EventType],
>(target: Target, eventType: EventType, listener: Listener): Unsubscribe {
  target.addEventListener(eventType, listener);
  return () => {
    target.removeEventListener(eventType, listener);
  };
}

export type inferEventMap<Target extends EventTargetLike> = tupleToEventMap<
  Parameters<Target["addEventListener"]>
>;

type tupleToEventMap<Target extends [EventTypeLike, AnyListener]> = {
  [EventType in Target[0]]: Target[1];
};

export type Unsubscribe = () => void;

type EventTypeLike = PropertyKey;

interface EventTargetLike {
  addEventListener(type: EventTypeLike, listener: AnyListener): void;
  removeEventListener(type: EventTypeLike, listener: AnyListener): void;
}

type AnyListener = (...args: unknown[]) => unknown;
