import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { atom, produce, type Atom } from "@mp/state";
import type {
  AnyProcedureDefinition,
  AnyProcedureRecord,
  AnyModuleDefinitionRecord,
  ProcedureDefinition,
  ProcedureHandler,
  ProcedureType,
} from "./module";
import type { Dispatcher } from "./dispatcher";
import { createDispatcher } from "./dispatcher";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_DTOParser,
  SocketIO_DTOSerializer,
  SocketIO_Headers,
  SocketIO_RPC,
  SocketIO_RPCResponse,
  SocketIO_ServerToClientEvents,
} from "./socket";

export class Client<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  State,
  StateUpdate,
> {
  private _state: Atom<State>;
  private _connected: Atom<boolean>;
  private socket: ClientSocket<StateUpdate>;

  readonly modules: ClientModuleRecord<ModuleDefinitions>;
  get connected(): boolean {
    return this._connected.get();
  }
  get state(): State {
    return this._state.get();
  }

  constructor(private options: ClientOptions<State, StateUpdate>) {
    this.socket = io(options.url, { transports: ["websocket"] });

    this.modules = createModuleInterface<ModuleDefinitions, State, StateUpdate>(
      this.socket,
      this.options,
    );

    this._connected = atom(false);
    this._state = atom(options.createInitialState());

    this.socket.on("stateUpdate", (update) => {
      this._state.set(
        produce<State>((prev) => {
          options.applyStateUpdate(
            prev as State,
            options.parseStateUpdate(update),
          );
        }),
      );
    });

    this.socket.on("connect", () => this._connected.set(true));
    this.socket.on("disconnect", () => this._connected.set(false));
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
    get: (_, moduleName) => createModuleDispatcher(moduleName, socket, options),
  });
}

function createModuleDispatcher<State, StateUpdate>(
  moduleName: PropertyKey,
  socket: ClientSocket<State>,
  options: ClientOptions<State, StateUpdate>,
) {
  return createDispatcher(async (procedureName, ...[input]) => {
    const headers = await options.getHeaders?.();
    const serializedResponse = await socket.emitWithAck(
      "rpc",
      options.serializeRPC({
        headers,
        moduleName: String(moduleName),
        procedureName: String(procedureName),
        input,
      }),
    );

    const response = options.parseRPCResponse(serializedResponse);
    if (!response.ok) {
      throw new Error(response.error);
    }
    return response.output as never;
  });
}

export interface BuiltInClientState {
  connected: boolean;
  clientId?: Socket["id"];
}

export interface ClientOptions<State, StateUpdate> {
  url: string;
  rpcTimeout: number;
  serializeRPC: SocketIO_DTOSerializer<SocketIO_RPC>;
  parseRPCResponse: SocketIO_DTOParser<SocketIO_RPCResponse<unknown>>;
  parseStateUpdate: SocketIO_DTOParser<StateUpdate>;
  applyStateUpdate: (state: State, update: StateUpdate) => unknown;
  createInitialState: () => State;
  getHeaders?: () =>
    | SocketIO_Headers
    | Promise<SocketIO_Headers | undefined>
    | undefined;
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
  Dispatcher<ClientToServerProcedures<Procedures>>;

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
