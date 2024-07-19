/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from "events";
import type { EventBus } from "./EventBus";
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

  Object.entries(events).forEach(([name, { handler, type }]) => {
    bus[name].subscribe((arg) => {
      const result = isEventAllowed(arg.origin, type);
      if (!result.ok) {
        throw new Error(result.error);
      }
      handler(arg);
    });
  });

  return bus;
}

function isEventAllowed(origin: EventOrigin, type: EventType) {
  if (type === "client-to-server" && origin === "client") {
    return { ok: true };
  }

  if (type === "server-to-client" && origin === "server") {
    return { ok: true };
  }

  if (type === "bidirectional") {
    return { ok: true };
  }

  return {
    ok: false,
    error: `Event type ${type} is not allowed from origin ${origin}`,
  };
}

export type Module<Events extends AnyEventRecord = AnyEventRecord> = EventBus<
  ModuleEvents<Events>,
  ModuleEvents<Events>
>;

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

export type EventOrigin = "client" | "server";

export interface EventHandlerArg<Payload = any, Context = any> {
  payload: Payload;
  context: Context;
  origin: EventOrigin;
}

export type EventType =
  | "client-to-server"
  | "server-to-client"
  | "bidirectional";

export type EventDefinition<
  Type extends EventType,
  Arg extends EventHandlerArg,
> = {
  type: Type;
  handler: EventHandler<Arg>;
};

export type EventHandler<Arg extends EventHandlerArg> = (
  arg: MakePayloadOptional<Arg>,
) => void;

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
