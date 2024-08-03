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

export class Client<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  State,
  StateUpdate,
> {
  private socket: ClientSocket<StateUpdate>;
  readonly modules: ClientModuleRecord<ModuleDefinitions>;
  readonly state: Signal<State>;

  get clientId() {
    return this.socket.id;
  }

  constructor(private options: ClientOptions<State, StateUpdate>) {
    this.socket = io(options.url, { transports: ["websocket"] });

    this.modules = createModuleInterface<ModuleDefinitions, State, StateUpdate>(
      this.socket,
      this.options,
    );

    this.state = signal(options.createInitialState());

    this.socket.on("stateUpdate", (serialized) => {
      this.state.value = options.createNextState(
        this.state.value,
        options.parseStateUpdate(serialized),
      );
    });

    this.socket.on(
      "disconnect",
      () => (this.state.value = options.createInitialState()),
    );
  }

  dispose() {
    this.socket.disconnect();
  }
}

function createModuleInterface<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  State,
  StateUpdate,
>(
  socket: ClientSocket<State>,
  options: ClientOptions<State, StateUpdate>,
): ClientModuleRecord<ModuleDefinitions> {
  return new Proxy({} as ClientModuleRecord<ModuleDefinitions>, {
    get: (_, moduleName) => createModuleEventBus(moduleName, socket, options),
  });
}

function createModuleEventBus<State, StateUpdate>(
  moduleName: PropertyKey,
  socket: ClientSocket<State>,
  options: ClientOptions<State, StateUpdate>,
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

export interface ClientOptions<State, StateUpdate> {
  url: string;
  serializeMessage: Serializer<SocketIO_Message>;
  parseStateUpdate: Parser<StateUpdate>;
  createNextState: (state: State, update: StateUpdate) => State;
  createInitialState: () => State;
}

export type * from "./serialization";

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
