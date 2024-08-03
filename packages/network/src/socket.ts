import type { Serialized } from "./serialization";

export interface SocketIO_ClientToServerEvents {
  rpc: (
    serializedRPC: Serialized<SocketIO_RPC>,
    respondWithOutput: (serializedOutput: Serialized<unknown>) => void,
  ) => void;
}

export interface SocketIO_RPC {
  moduleName: string;
  procedureName: string;
  input: unknown;
}

export interface SocketIO_ServerToClientEvents<StateUpdate> {
  stateUpdate: (update: Serialized<StateUpdate>) => void;
}
