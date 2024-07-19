import type { Unsubscribe } from "./shared";

export function createEventBus<
  OutgoingEvents extends AnyEvents,
  IncomingEvents extends AnyEvents,
>(
  outgoingEventHandlers: OutgoingEvents,
  incomingEventSubscribers = {} as Subscribers<IncomingEvents>,
): EventBus<OutgoingEvents, IncomingEvents> {
  return new Proxy({} as EventBus<OutgoingEvents, IncomingEvents>, {
    get(_, eventName) {
      function send(...args: unknown[]): void {
        outgoingEventHandlers[eventName](...args);
      }

      send.subscribe = (receive: (...args: unknown[]) => void) =>
        incomingEventSubscribers[eventName](receive as never);

      return send;
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvents = { [K: PropertyKey]: (...args: any[]) => void };

export type EventBus<
  OutgoingEvents extends AnyEvents,
  IncomingEvents extends AnyEvents,
> = {
  [EventName in keyof OutgoingEvents]: OutgoingEvents[EventName];
} & {
  [EventName in keyof IncomingEvents]: {
    subscribe(handler: IncomingEvents[EventName]): Unsubscribe;
  };
};

export type Subscribers<IncomingEvents extends AnyEvents> = {
  [EventName in keyof IncomingEvents]: (
    receive: IncomingEvents[EventName],
  ) => Unsubscribe;
};
