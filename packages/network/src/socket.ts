import type { Serialized } from "./serialization";

export interface SocketIO_ClientToServerEvents {
  message: (serializedMessage: Serialized<SocketIO_Message>) => void;
}

export interface SocketIO_Message {
  moduleName: string;
  eventName: string;
  payload: unknown;
}

export interface SocketIO_ServerToClientEvents<StateUpdate> {
  stateUpdate: (data: Serialized<StateUpdate>) => void;
}
