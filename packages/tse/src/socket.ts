import type { Serialized } from "./serialization";

export type SocketIO_Data<ClientContext> = ClientContext;

export interface SocketIO_ClientToServerEvents {
  message: (serializedMessage: Serialized<SocketIO_Message>) => void;
}

export interface SocketIO_Message {
  moduleName: string;
  eventName: string;
  payload: unknown;
}

export interface SocketIO_ServerToClientEvents<ClientState> {
  clientState: (data: Serialized<ClientState>) => void;
}
