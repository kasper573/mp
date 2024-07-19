import type { Unsubscribe } from "./shared";

export function createEventBus<
  OutgoingEvents extends AnyEvents,
  IncomingEvents extends AnyEvents,
>(
  emitOutgoingEvent: EmitFnFor<OutgoingEvents>,
  subscribeToAllIncomingEvents = noop as SubscribeFnFor<IncomingEvents>,
): EventBus<OutgoingEvents, IncomingEvents> {
  return new Proxy({} as EventBus<OutgoingEvents, IncomingEvents>, {
    get(_, propertyName: string) {
      if (propertyName === subscribeAllProperty) {
        return subscribeToAllIncomingEvents;
      }
      function event(
        ...args: Parameters<OutgoingEvents[keyof OutgoingEvents]>
      ): void {
        emitOutgoingEvent(propertyName, ...args);
      }

      event.subscribe = (handler: IncomingEvents[keyof IncomingEvents]) =>
        subscribeToAllIncomingEvents((receivedEventName, ...args) => {
          if (receivedEventName === propertyName) {
            handler(...args);
          }
        });

      return event;
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvents = { [K: string]: (...args: any[]) => void };

export type EventBus<
  OutgoingEvents extends AnyEvents,
  IncomingEvents extends AnyEvents,
> = {
  [EventName in keyof OutgoingEvents]: OutgoingEvents[EventName];
} & {
  [EventName in keyof IncomingEvents]: {
    subscribe(handler: IncomingEvents[EventName]): Unsubscribe;
  };
} & {
  [subscribeAllProperty](handler: EmitFnFor<IncomingEvents>): Unsubscribe;
};

export type EmitFnFor<Events extends AnyEvents> = <
  EventName extends keyof Events,
>(
  eventName: EventName,
  ...args: Parameters<Events[EventName]>
) => void;

export type SubscribeFnFor<Events extends AnyEvents> = (
  handler: EmitFnFor<Events>,
) => Unsubscribe;

const noop = () => () => {};

const subscribeAllProperty = "$subscribe" as const;
