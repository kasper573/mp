import type { Serialized } from "./transformer";

export type SocketIO_Data<ClientContext> = ClientContext;

export interface SocketIO_ClientToServerEvents<ClientContext> {
  message: (
    data: Serialized<{
      moduleName: string;
      eventName: string;
      payload: unknown;
      clientContext: ClientContext;
    }>,
  ) => void;
  context: (clientContext: Serialized<ClientContext>) => void;
}

export interface SocketIO_ServerToClientEvents<ClientState> {
  clientState: (data: Serialized<ClientState>) => void;
}
