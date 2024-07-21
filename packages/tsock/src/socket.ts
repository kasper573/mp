export type SocketIO_Data<ClientContext> = ClientContext;

export interface SocketIO_ClientToServerEvents<ClientContext> {
  message: (
    moduleName: string,
    eventName: string,
    payload: unknown,
    clientContext: ClientContext,
  ) => void;
  context: (clientContext: ClientContext) => void;
}

export type SocketIO_ServerToClientEvents = Record<
  string,
  (...args: unknown[]) => void
>;
