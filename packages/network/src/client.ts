import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { signal, type Signal } from "@preact/signals-core";
import type {
  AnyEventDefinition,
  AnyEventRecord,
  AnyModuleDefinitionRecord,
  EventDefinition,
  EventHandler,
  EventType,
} from "./module";
import type { EventBus } from "./event";
import { createEventBus } from "./event";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_Message,
  SocketIO_ServerToClientEvents,
} from "./socket";
import type { Parser, Serializer } from "./serialization";

export type * from "./serialization";

export interface ClientOptions<State> {
  url: string;
  disconnectedState: State;
  serializeMessage: Serializer<SocketIO_Message>;
  parseClientState: Parser<State>;
}

export class Client<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  State,
> {
  private socket: ClientSocket<State>;
  readonly modules: ClientModuleRecord<ModuleDefinitions>;
  readonly state: Signal<State>;

  get clientId() {
    return this.socket.id;
  }

  constructor(private options: ClientOptions<State>) {
    this.socket = io(options.url, { transports: ["websocket"] });

    this.modules = createModuleInterface<ModuleDefinitions, State>(
      this.socket,
      this.options,
    );

    this.state = signal(options.disconnectedState);

    this.socket.on("clientState", (serializedState) => {
      this.state.value = this.options.parseClientState(serializedState);
    });

    this.socket.on(
      "disconnect",
      () => (this.state.value = options.disconnectedState),
    );
  }

  dispose() {
    this.socket.disconnect();
  }
}

function createModuleInterface<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  State,
>(
  socket: ClientSocket<State>,
  options: ClientOptions<State>,
): ClientModuleRecord<ModuleDefinitions> {
  return new Proxy({} as ClientModuleRecord<ModuleDefinitions>, {
    get: (_, moduleName) => createModuleEventBus(moduleName, socket, options),
  });
}

function createModuleEventBus<State>(
  moduleName: PropertyKey,
  socket: ClientSocket<State>,
  options: ClientOptions<State>,
) {
  return createEventBus((eventName, ...args) => {
    const [payload] = args;
    socket.emit(
      "message",
      options.serializeMessage({
        moduleName: String(moduleName),
        eventName: String(eventName),
        payload,
      }),
    );
  });
}

type ClientSocket<State> = Socket<
  SocketIO_ServerToClientEvents<State>,
  SocketIO_ClientToServerEvents
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
