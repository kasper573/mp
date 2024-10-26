import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
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

export class Client<ModuleDefinitions extends AnyModuleDefinitionRecord> {
  private socket: ClientSocket;

  readonly modules: ClientModuleRecord<ModuleDefinitions>;

  constructor(private options: ClientOptions) {
    this.socket = io(options.url, { transports: ["websocket"] });
    this.modules = createModuleInterface(this.socket, this.options);
    this.socket.on("stateUpdate", options.applyStateUpdate);
    this.socket.on("connect", options.onConnect ?? noop);
    this.socket.on("disconnect", options.onDisconnect ?? noop);
  }

  dispose() {
    this.socket.disconnect();
  }
}

function createModuleInterface<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
>(
  socket: ClientSocket,
  options: ClientOptions,
): ClientModuleRecord<ModuleDefinitions> {
  return new Proxy({} as ClientModuleRecord<ModuleDefinitions>, {
    get: (_, moduleName) => createModuleDispatcher(moduleName, socket, options),
  });
}

function createModuleDispatcher(
  moduleName: PropertyKey,
  socket: ClientSocket,
  options: ClientOptions,
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

export interface ClientOptions {
  url: string;
  rpcTimeout: number;
  serializeRPC: SocketIO_DTOSerializer<SocketIO_RPC>;
  parseRPCResponse: SocketIO_DTOParser<SocketIO_RPCResponse<unknown>>;
  applyStateUpdate: (update: Uint8Array) => unknown;
  getHeaders?: () =>
    | SocketIO_Headers
    | Promise<SocketIO_Headers | undefined>
    | undefined;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export type { SocketIO_DTO } from "./socket";

type ClientSocket = Socket<
  SocketIO_ServerToClientEvents,
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

const noop = () => {};
