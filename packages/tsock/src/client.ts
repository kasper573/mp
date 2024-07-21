import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { Logger } from "./logger";
import type {
  AnyEventDefinition,
  AnyEventRecord,
  AnyModuleDefinitionRecord,
  EventDefinition,
  EventHandler,
  EventType,
} from "./module";
import type { EventBus, Unsubscribe } from "./event";
import { createEventBus } from "./event";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_ServerToClientEvents,
} from "./socket";
import type { Serialized } from "./transformer";
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
  State,
> {
  private socket: ClientSocket<Context, State>;
  modules: ClientModuleRecord<ModuleDefinitions>;

  constructor(private options: ClientOptions<Context>) {
    this.socket = io(options.url, { transports: ["websocket"] });
    this.socket.emit("context", transformer.serialize(options.context()));
    this.modules = createModuleInterface<ModuleDefinitions, Context, State>(
      this.socket,
      this.options,
    );
  }

  subscribeToState = (
    handleStateChange: (state: State) => void,
  ): Unsubscribe => {
    const handler = (serializedState: Serialized<State>) =>
      handleStateChange(transformer.parse(serializedState));
    this.socket.on("clientState", handler);
    return () => this.socket.off("clientState", handler);
  };
}

function createModuleInterface<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  Context,
  State,
>(
  socket: ClientSocket<Context, State>,
  options: ClientOptions<Context>,
): ClientModuleRecord<ModuleDefinitions> {
  return new Proxy({} as ClientModuleRecord<ModuleDefinitions>, {
    get: (_, moduleName) => createModuleEventBus(moduleName, socket, options),
  });
}

function createModuleEventBus<Context, State>(
  moduleName: PropertyKey,
  socket: ClientSocket<Context, State>,
  options: ClientOptions<Context>,
) {
  const logger = options.logger?.chain(moduleName);
  return createEventBus((eventName, ...args) => {
    const [payload] = args;
    logger?.chain(eventName).info(payload);
    socket.emit(
      "message",
      transformer.serialize({
        moduleName: String(moduleName),
        eventName: String(eventName),
        payload,
        clientContext: options.context(),
      }),
    );
  });
}

type ClientSocket<Context, State> = Socket<
  SocketIO_ServerToClientEvents<State>,
  SocketIO_ClientToServerEvents<Context>
>;

type ClientModuleRecord<Events extends AnyModuleDefinitionRecord> = {
  [K in keyof Events]: ClientModule<Events[K]>;
};

type ClientModule<Events extends AnyEventRecord = AnyEventRecord> = EventBus<
  ClientToServerEvents<Events>,
  {}
>;

type ClientToServerEvents<Events extends AnyEventRecord> = {
  [EventName in EventNamesForType<
    Events,
    "client-to-server"
  >]: ClientEventHandler<Events[EventName]>;
};

type ClientEventHandler<
  Event extends AnyEventDefinition,
  Type extends EventType = EventType,
> =
  Event extends EventDefinition<Type, infer Arg>
    ? EventHandler<Arg["payload"]>
    : never;

// This seems to cause the language service to fail to go to definition
// on module events even though it resolves to the correct types
type EventNamesForType<
  Events extends AnyEventRecord,
  Type extends EventType,
> = {
  [Key in keyof Events]: Events[Key] extends EventDefinition<Type>
    ? Key
    : never;
}[keyof Events];
