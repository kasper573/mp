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
        return (
          handleDiscriminatedEvent: DiscriminatedEventHandler<IncomingEvents>,
        ) =>
          subscribeToAllIncomingEvents((eventName, ...args) =>
            handleDiscriminatedEvent({ name: eventName, args }),
          );
      }

      function event(
        ...args: Parameters<OutgoingEvents[keyof OutgoingEvents]>
      ): EventResult {
        return emitOutgoingEvent(propertyName, ...args);
      }

      event.subscribe = (handler: IncomingEvents[keyof IncomingEvents]) =>
        subscribeToAllIncomingEvents((receivedEventName, ...args) => {
          if (receivedEventName === propertyName) {
            return handler(...args);
          }
        });

      return event;
    },
  });
}

export type EventError = string;

export type EventResult = void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvents = { [K: string]: (...args: any[]) => EventResult };

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
  [subscribeAllProperty](
    handler: DiscriminatedEventHandler<IncomingEvents>,
  ): Unsubscribe;
};

export type DiscriminatedEventHandler<Events extends AnyEvents> = (
  event: DiscriminatedEvent<Events>,
) => EventResult;

export type DiscriminatedEvent<Events extends AnyEvents> = {
  [EventName in keyof Events]: {
    name: EventName;
    args: Parameters<Events[EventName]>;
  };
}[keyof Events];

export type EmitFnFor<Events extends AnyEvents> = <
  EventName extends keyof Events,
>(
  eventName: EventName,
  ...args: Parameters<Events[EventName]>
) => EventResult;

export type SubscribeFnFor<Events extends AnyEvents> = (
  handler: EmitFnFor<Events>,
) => Unsubscribe;

const noop = () => () => {};

const subscribeAllProperty = "$subscribe" as const;
