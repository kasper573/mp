/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from "events";
import type { EventBus, EventResult } from "./EventBus";
import { createEventBus } from "./EventBus";

export function createModule<Events extends AnyEventRecord>(
  events: Events,
): Module<Events> {
  const emitter = new EventEmitter();

  const bus = createEventBus<ModuleEvents<Events>, ModuleEvents<Events>>(
    (...args) => emitter.emit("event", ...args),
    (handler) => {
      emitter.on("event", handler);
      return () => emitter.off("event", handler);
    },
  );

  Object.entries(events).forEach(([name, { handler }]) =>
    bus[name].subscribe(handler),
  );

  return new Proxy(bus as Module<Events>, {
    get(target, prop) {
      if (prop === "getEventType") {
        return (eventName: keyof Events) => events[eventName].type;
      } else {
        return target[prop];
      }
    },
  });
}

export type Module<Events extends AnyEventRecord = AnyEventRecord> = EventBus<
  ModuleEvents<Events>,
  ModuleEvents<Events>
> & {
  getEventType(eventName: keyof Events): EventType;
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

export type EventType = "public" | "private";

export type EventDefinition<
  Type extends EventType,
  Arg extends EventHandlerArg,
> = {
  type: Type;
  handler: EventHandler<Arg>;
};

export type EventHandler<Arg extends EventHandlerArg> = (
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
