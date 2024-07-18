/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Unsubscribe } from "./shared";

/**
 * A server module is a collection of event handlers that can be invoked and
 * subscribed to.
 */
export class Module<Events extends EventDefinitionRecord<Context>, Context> {
  private eventSubscriptions = new Map<
    AnyEventName<this>,
    Set<(payload: AnyEventPayload, context: Context) => void>
  >();

  private anySubscriptions = new Set<
    (
      eventName: AnyEventName<this>,
      payload: AnyEventPayload,
      context: Context,
    ) => void
  >();

  constructor(public events: Events) {}

  /**
   * Invoke the built-in event handler and emit the event to all subscribers.
   */
  invoke<EventName extends AnyEventName<this>>(
    eventName: EventName,
    payload: EventPayload<this["events"][EventName]>,
    context: Context,
  ): void {
    this.events[eventName].handler({ payload, context });

    this.emit(eventName, payload, context);
  }

  /**
   * Emit an event to all subscribers of this module.
   */
  emit<EventName extends AnyEventName<this>>(
    eventName: EventName,
    payload: EventPayload<this["events"][EventName]>,
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
    handler: (
      payload: EventPayload<this["events"][EventName]>,
      context: Context,
    ) => void,
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
      payload: EventPayload<this["events"][EventName]>,
      context: Context,
    ) => void,
  ): Unsubscribe {
    this.anySubscriptions.add(handler);
    return () => this.anySubscriptions.delete(handler);
  }
}

export type EventDefinitionRecord<Context> = {
  [K: PropertyKey]: EventDefinition<any, any, Context>;
};

export type EventType =
  | "client-to-server"
  | "server-to-client"
  | "bidirectional";

export type AnyEventDefinition<Context = any> = EventDefinition<
  EventType,
  any,
  Context
>;

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

export type EventPayload<Event extends AnyEventDefinition> =
  Event["__payloadType__"];

export type AnyModule = Module<any, any>;

export type AnyEventName<M extends AnyModule> = keyof M["events"];

export type AnyEventPayload = EventPayload<AnyEventDefinition>;

export type AnyModules<Context = any> = Record<
  PropertyKey,
  Module<any, Context>
>;

export type AnyModuleName<Modules extends AnyModules> = keyof Modules;
