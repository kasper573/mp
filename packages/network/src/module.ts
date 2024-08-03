/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EmitFn, EventBus, EventResult } from "./event";
import { createEventBus } from "./event";

export function createModule<Events extends AnyEventRecord>(
  events: Events,
): Module<Events> {
  const fns = new Set<EmitFn>();

  // A module is essentially just an event bus
  const bus = createEventBus(
    (...args) => fns.forEach((fn) => fn(...args)),
    (fn) => {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  );

  // But with predefined event handlers
  Object.entries(events).forEach(([name, { handler }]) =>
    bus[name].subscribe(handler),
  );

  return new Proxy(bus as Module<Events>, {
    get(target, prop) {
      // It has the ability to inspect the type of an event
      if (prop === eventTypeGetter) {
        return (eventName: keyof Events) => events[eventName].type;
      } else {
        // And everything else an event bus can do
        return target[prop];
      }
    },
  });
}

const eventTypeGetter = "$getEventType" as const;

export type Module<Events extends AnyEventRecord = AnyEventRecord> = EventBus<
  ModuleEvents<Events>,
  ModuleEvents<Events>
> & {
  [eventTypeGetter](eventName: keyof Events): EventType;
};

export type ModuleRecord<Events extends AnyModuleDefinitionRecord> = {
  [K in keyof Events]: Module<Events[K]>;
};

export type inferModuleDefinitions<T> =
  T extends ModuleRecord<infer Definitions> ? Definitions : never;

export type AnyModuleDefinitionRecord = Record<PropertyKey, AnyEventRecord>;

export type AnyEventRecord<Arg extends EventHandlerArg = EventHandlerArg> = {
  [K: PropertyKey]: AnyEventDefinition<Arg>;
};

export type AnyEventDefinition<Arg extends EventHandlerArg = EventHandlerArg> =
  EventDefinition<EventType, Arg>;

export interface EventHandlerArg<Payload = any, Context = any> {
  payload: Payload;
  context: Context;
}

export type EventType = "client-to-server" | "server-only";

export type EventDefinition<
  Type extends EventType,
  Arg extends EventHandlerArg = EventHandlerArg,
> = {
  type: Type;
  handler: EventHandler<Arg>;
};

export type EventHandler<Arg extends EventHandlerArg = EventHandlerArg> = (
  arg: MakePayloadOptional<Arg>,
) => EventResult;

export type ModuleEvents<Events extends AnyEventRecord> = {
  [EventName in keyof Events]: Events[EventName]["handler"];
};

type MakePayloadOptional<Arg extends EventHandlerArg> =
  isExactlyVoid<Arg["payload"]> extends true ? Pick<Arg, "context"> : Arg;

type isExactlyVoid<T> = void extends T
  ? T extends void
    ? true
    : false
  : false;
