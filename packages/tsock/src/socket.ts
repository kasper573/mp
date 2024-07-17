export interface ServerToClientEvents {}

export interface ClientToServerEvents<ClientContext> {
  operation: (
    clientContext: ClientContext,
    path: RouterPath,
    input: unknown,
  ) => void;
}

export interface InterServerEvents {}

export interface SocketData {}

export type RouterPath = string[];
