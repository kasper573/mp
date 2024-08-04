import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import type { ReadonlySignal } from "@preact/signals-core";
import { computed, signal, type Signal } from "@preact/signals-core";
import type {
  AnyProcedureDefinition,
  AnyProcedureRecord,
  AnyModuleDefinitionRecord,
  ProcedureDefinition,
  ProcedureHandler,
  ProcedureType,
} from "./module";
import type { ProcedureBus } from "./procedure";
import { createProcedureBus } from "./procedure";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_DTOParser,
  SocketIO_DTOSerializer,
  SocketIO_RPC,
  SocketIO_ServerToClientEvents,
} from "./socket";

export class Client<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  State,
  StateUpdate,
> {
  private socket: ClientSocket<StateUpdate>;
  readonly modules: ClientModuleRecord<ModuleDefinitions>;

  private _state: Signal<State>;

  readonly connected = signal(false);
  readonly state: ReadonlySignal<State> = computed(() => this._state.value);
  get clientId() {
    return this.socket.id;
  }

  constructor(private options: ClientOptions<State, StateUpdate>) {
    this.socket = io(options.url, { transports: ["websocket"] });

    this.modules = createModuleInterface<ModuleDefinitions, State, StateUpdate>(
      this.socket,
      this.options,
    );

    this._state = signal(options.createInitialState());

    this.socket.on("stateUpdate", (update) => {
      this._state.value = options.createNextState(
        this._state.value,
        options.parseStateUpdate(update),
      );
    });

    this.socket.on("connect", () => (this.connected.value = true));
    this.socket.on("disconnect", () => (this.connected.value = false));
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
    get: (_, moduleName) =>
      createModuleProcedureBus(moduleName, socket, options),
  });
}

function createModuleProcedureBus<State, StateUpdate>(
  moduleName: PropertyKey,
  socket: ClientSocket<State>,
  options: ClientOptions<State, StateUpdate>,
) {
  return createProcedureBus(
    async (procedureName, ...[input]) => {
      const serializedResponse = await socket.emitWithAck(
        "rpc",
        options.serializeRPC({
          moduleName: String(moduleName),
          procedureName: String(procedureName),
          input,
        }),
      );

      return options.parseRPCOutput(serializedResponse) as never;
    },
    () => {
      throw new Error("Subscriptions are not supported on the client");
    },
  );
}

export interface BuiltInClientState {
  connected: boolean;
  clientId?: Socket["id"];
}

export interface ClientOptions<State, StateUpdate> {
  url: string;
  serializeRPC: SocketIO_DTOSerializer<SocketIO_RPC>;
  parseRPCOutput: SocketIO_DTOParser<unknown>;
  parseStateUpdate: SocketIO_DTOParser<StateUpdate>;
  createNextState: (state: State, update: StateUpdate) => State;
  createInitialState: () => State;
}

export type { SocketIO_DTO } from "./socket";

type ClientSocket<State> = Socket<
  SocketIO_ServerToClientEvents<State>,
  SocketIO_ClientToServerEvents
>;

type ClientModuleRecord<Procedures extends AnyModuleDefinitionRecord> = {
  [K in keyof Procedures]: ClientModule<Procedures[K]>;
};

type ClientModule<Procedures extends AnyProcedureRecord = AnyProcedureRecord> =
  ProcedureBus<ClientToServerProcedures<Procedures>, {}>;

type ClientToServerProcedures<Procedures extends AnyProcedureRecord> = {
  [ProcedureName in ProcedureNamesForType<
    Procedures,
    "client-to-server"
  >]: ClientProcedureHandler<Procedures[ProcedureName]>;
};

type ClientProcedureHandler<
  Procedure extends AnyProcedureDefinition,
  Type extends ProcedureType = ProcedureType,
> =
  Procedure extends ProcedureDefinition<Type, infer Payload, infer Output>
    ? ProcedureHandler<Payload["input"], Output>
    : never;

// This seems to cause the language service to fail to go to definition
// on module procedures even though it resolves to the correct types
type ProcedureNamesForType<
  Procedures extends AnyProcedureRecord,
  Type extends ProcedureType,
> = {
  [Key in keyof Procedures]: Procedures[Key] extends ProcedureDefinition<
    Type,
    infer _1,
    infer _2
  >
    ? Key
    : never;
}[keyof Procedures];
