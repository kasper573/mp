import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { Logger } from "./logger";
import type {
  AnyEventDefinition,
  AnyEventRecord,
  AnyModuleDefinitionRecord,
  EventDefinition,
  EventHandler,
  EventOrigin,
} from "./module";
import type { EventBus } from "./event";
import { createEventBus } from "./event";

export { Logger };

export interface ClientOptions<Context> {
  url: string;
  context: () => Context;
  logger?: Logger;
}

export class Client<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  Context,
> {
  private socket: Socket;
  modules: ClientModuleRecord<ModuleDefinitions>;

  constructor(private options: ClientOptions<Context>) {
    this.socket = io(options.url, { transports: ["websocket"] });
    this.modules = createModuleInterface<ModuleDefinitions, Context>(
      this.socket,
      this.options,
    );
  }
}

function createModuleInterface<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  Context,
>(
  socket: Socket,
  options: ClientOptions<Context>,
): ClientModuleRecord<ModuleDefinitions> {
  return new Proxy({} as ClientModuleRecord<ModuleDefinitions>, {
    get: (_, moduleName) => createModuleEventBus(moduleName, socket, options),
  });
}

function createModuleEventBus<Context>(
  moduleName: PropertyKey,
  socket: Socket,
  options: ClientOptions<Context>,
) {
  const logger = options.logger?.chain(moduleName);
  return createEventBus(
    (eventName, ...args) => {
      const [payload] = args;
      logger?.chain(eventName).info(">>", payload);
      socket.send(moduleName, eventName, payload, options.context());
    },
    (handler) => {
      function handlerWithLogging(
        _: string,
        eventName: string,
        payload: unknown,
      ) {
        logger?.chain(eventName).info("<<", payload);
        return handler(eventName, payload);
      }
      socket.onAny(handlerWithLogging);
      return () => socket.offAny(handlerWithLogging);
    },
  );
}

type ClientModuleRecord<Events extends AnyModuleDefinitionRecord> = {
  [K in keyof Events]: ClientModule<Events[K]>;
};

type ClientModule<Events extends AnyEventRecord = AnyEventRecord> = EventBus<
  ClientToServerEvents<Events>,
  ServerToClientEvents<Events>
>;

type ClientToServerEvents<Events extends AnyEventRecord> = {
  [EventName in EventNamesForOrigin<Events, "client">]: ClientEventHandler<
    Events[EventName]
  >;
};

type ServerToClientEvents<Events extends AnyEventRecord> = {
  [EventName in EventNamesForOrigin<Events, "server">]: ClientEventHandler<
    Events[EventName]
  >;
};

type ClientEventHandler<
  Event extends AnyEventDefinition,
  Origin extends EventOrigin = EventOrigin,
> =
  Event extends EventDefinition<Origin, infer Arg>
    ? EventHandler<Arg["payload"]>
    : never;

// This seems to cause the language service to fail to go to definition
// on module events even though it resolves to the correct types
type EventNamesForOrigin<
  Events extends AnyEventRecord,
  Origin extends EventOrigin,
> = {
  [Key in keyof Events]: Events[Key] extends EventDefinition<Origin>
    ? Key
    : never;
}[keyof Events];
