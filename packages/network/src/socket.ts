export interface SocketIO_ClientToServerEvents {
  rpc: (
    rpc: SocketIO_DTO<SocketIO_RPC>,
    respondWithOutput: (
      output: SocketIO_DTO<SocketIO_RPCResponse<unknown>>,
    ) => void,
  ) => void;
}

export interface SocketIO_RPC {
  moduleName: string;
  procedureName: string;
  input: unknown;
}

export type SocketIO_RPCResponse<Output> =
  | { ok: true; output: Output }
  | { ok: false; error: string };

export interface SocketIO_ServerToClientEvents<StateUpdate> {
  stateUpdate: (update: SocketIO_DTO<StateUpdate>) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SocketIO_DTOSerializer<T = any> = (value: T) => SocketIO_DTO<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SocketIO_DTOParser<T = any> = (data: SocketIO_DTO<T>) => T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SocketIO_DTO<T = any> = (Uint8Array | string) & {
  T?: T;
  __brand__: "SocketIO_DTO";
};

export interface SocketIO_Auth {
  token: string;
}
