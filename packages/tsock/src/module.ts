import type { Unsubscribe } from "./shared";

/**
 * A server module is a collection of event handlers that can be invoked and
 * subscribed to.
 */
export class Module<Definition extends EventHandlers<Context>, Context> {
  private eventSubscriptions = new Map<
    AnyEventName<this>,
    Set<(payload: AnyEventPayload<this>, context: Context) => void>
  >();

  private anySubscriptions = new Set<
    (
      eventName: AnyEventName<this>,
      payload: AnyEventPayload<this>,
      context: Context,
    ) => void
  >();

  constructor(public definition: Definition) {}

  /**
   * Invoke the built-in event handler and emit the event to all subscribers.
   */
  invoke<EventName extends AnyEventName<this>>(
    eventName: EventName,
    payload: EventPayload<this, EventName>,
    context: Context,
  ): void {
    this.definition[eventName]({ payload, context });

    this.emit(eventName, payload, context);
  }

  /**
   * Emit an event to all subscribers of this module.
   */
  emit<EventName extends AnyEventName<this>>(
    eventName: EventName,
    payload: EventPayload<this, EventName>,
    context: Context,
  ): void {
    const handlersForEvent = this.eventSubscriptions.get(eventName);
    if (handlersForEvent) {
      for (const handler of handlersForEvent) {
        handler(payload, context);
      }
    }

    for (const handler of this.anySubscriptions) {
      handler(eventName, payload, context);
    }
  }

  subscribe<EventName extends AnyEventName<this>>(
    eventName: EventName,
    handler: (payload: EventPayload<this, EventName>, context: Context) => void,
  ): Unsubscribe {
    let handlersForEvent = this.eventSubscriptions.get(eventName);
    if (!handlersForEvent) {
      handlersForEvent = new Set();
      this.eventSubscriptions.set(eventName, handlersForEvent);
    }
    handlersForEvent.add(handler);
    return () => handlersForEvent.delete(handler);
  }

  subscribeAny(
    handler: <EventName extends AnyEventName<this>>(
      eventName: EventName,
      payload: EventPayload<this, EventName>,
      context: Context,
    ) => void,
  ): Unsubscribe {
    this.anySubscriptions.add(handler);
    return () => this.anySubscriptions.delete(handler);
  }
}

export type EventHandlers<Context> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K: PropertyKey]: EventHandler<any, Context>;
};

export type EventHandler<Payload, Context> = (args: {
  payload: Payload;
  context: Context;
}) => void;

export type EventPayload<
  Module extends AnyModule,
  EventName extends AnyEventName<Module> = AnyEventName<Module>,
> =
  Module["definition"][EventName] extends EventHandler<infer Payload, infer _>
    ? Payload
    : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModule = Module<any, any>;

export type AnyEventName<M extends AnyModule> = keyof M["definition"];

export type AnyEventPayload<Module extends AnyModule = AnyModule> =
  EventPayload<Module, AnyEventName<Module>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModules<Context = any> = Record<
  PropertyKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module<any, Context>
>;

export type AnyModuleName<Modules extends AnyModules> = keyof Modules;
