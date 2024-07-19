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

  for (const [name, { handler }] of Object.entries(events)) {
    bus[name].subscribe(handler);
  }

  return bus;
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

export type AnyEventRecord<
  Arg extends AnyEventHandlerArg = AnyEventHandlerArg,
> = {
  [K: PropertyKey]: AnyEventDefinition<Arg>;
};

export type AnyEventDefinition<
  Arg extends AnyEventHandlerArg = AnyEventHandlerArg,
> = EventDefinition<EventType, Arg>;

export type AnyEventHandlerArg = { payload: any; context: any };

export type EventType =
  | "client-to-server"
  | "server-to-client"
  | "bidirectional";

export type EventDefinition<
  Type extends EventType,
  Arg extends AnyEventHandlerArg,
> = {
  type: Type;
  handler: EventHandler<Arg>;
};

export type EventHandler<Arg extends AnyEventHandlerArg> = (
  arg: MakePayloadOptional<Arg>,
) => void;

export type ModuleEvents<Events extends AnyEventRecord> = {
  [EventName in keyof Events]: Events[EventName]["handler"];
};

type MakePayloadOptional<Arg extends AnyEventHandlerArg> =
  isExactlyVoid<Arg["payload"]> extends true ? Pick<Arg, "context"> : Arg;

type isExactlyVoid<T> = void extends T
  ? T extends void
    ? true
    : false
  : false;
