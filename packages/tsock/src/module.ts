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

export type ModuleRecord<Definitions extends AnyModuleDefinitionRecord> = {
  [K in keyof Definitions]: Module<Definitions[K]>;
};

export type inferModuleDefinitions<T> =
  T extends ModuleRecord<infer Definitions> ? Definitions : never;

export type AnyModuleDefinitionRecord = Record<PropertyKey, AnyEventRecord>;

export type AnyEventRecord = {
  [K: PropertyKey]: AnyEventDefinition;
};

export type AnyEventDefinition = EventDefinition<EventType, any[]>;

export type EventType =
  | "client-to-server"
  | "server-to-client"
  | "bidirectional";

export type EventDefinition<Type extends EventType, Args extends any[]> = {
  type: Type;
  handler: EventHandler<Args>;
};

export type EventHandler<Args extends any[]> = (...args: Args) => void;

export type ModuleEvents<Events extends AnyEventRecord> = {
  [EventName in keyof Events]: Events[EventName]["handler"];
};
