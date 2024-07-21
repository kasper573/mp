import type { Serialized } from "./transformer";

export type SocketIO_Data<ClientContext> = ClientContext;

export interface SocketIO_ClientToServerEvents {
  message: (
    data: Serialized<{
      moduleName: string;
      eventName: string;
      payload: unknown;
    }>,
  ) => void;
}

export interface SocketIO_ServerToClientEvents<ClientState> {
  clientState: (data: Serialized<ClientState>) => void;
}
