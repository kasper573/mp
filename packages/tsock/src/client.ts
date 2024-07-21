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
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_ServerToClientEvents,
} from "./socket";
import { transformer } from "./transformer";

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
  private socket: ClientSocket<Context>;
  modules: ClientModuleRecord<ModuleDefinitions>;

  constructor(private options: ClientOptions<Context>) {
    this.socket = io(options.url, { transports: ["websocket"] });
    this.socket.emit("context", transformer.serialize(options.context()));
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
  socket: ClientSocket<Context>,
  options: ClientOptions<Context>,
): ClientModuleRecord<ModuleDefinitions> {
  return new Proxy({} as ClientModuleRecord<ModuleDefinitions>, {
    get: (_, moduleName) => createModuleEventBus(moduleName, socket, options),
  });
}

function createModuleEventBus<Context>(
  moduleName: PropertyKey,
  socket: ClientSocket<Context>,
  options: ClientOptions<Context>,
) {
  const logger = options.logger?.chain(moduleName);
  return createEventBus(
    (eventName, ...args) => {
      const [payload] = args;
      logger?.chain(eventName).info(">>", payload);
      socket.emit(
        "message",
        transformer.serialize({
          moduleName: String(moduleName),
          eventName: String(eventName),
          payload,
          clientContext: options.context(),
        }),
      );
    },
    (sendToBus) => {
      const handler: SocketIO_ServerToClientEvents["message"] = (
        serializedData,
      ) => {
        const msg = transformer.parse(serializedData);
        if (msg.moduleName === moduleName) {
          logger?.chain(msg.eventName).info("<<", msg.payload);
          sendToBus(msg.eventName, msg.payload);
        }
      };
      socket.on("message", handler);
      return () => socket.off("message", handler);
    },
  );
}

type ClientSocket<Context> = Socket<
  SocketIO_ServerToClientEvents,
  SocketIO_ClientToServerEvents<Context>
>;

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
