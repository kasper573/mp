import type { Unsubscribe } from "./shared";

/**
 * A server module is a collection of event handlers that can be invoked and
 * subscribed to.
 */
export class Module<Definition extends ModuleDefinition<Context>, Context> {
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
    this.definition[eventName].handler({ payload, context });

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

export type ModuleDefinition<Context> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K: PropertyKey]: EventDefinition<any, any, Context>;
};

export type EventType =
  | "client-to-server"
  | "server-to-client"
  | "bidirectional";

export type EventDefinition<Type extends EventType, Payload, Context> = {
  type: Type;
  handler: EventHandler<Payload, Context>;

  /**
   * Don't use this field at runtime. It only exists for type inference.
   */
  __payloadType__: Payload;
};

export type EventHandler<Payload, Context> = (args: {
  payload: Payload;
  context: Context;
}) => void;

export type EventPayload<
  Module extends AnyModule,
  EventName extends AnyEventName<Module> = AnyEventName<Module>,
> = Module["definition"][EventName]["__payloadType__"];

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
