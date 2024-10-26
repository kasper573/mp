export interface SocketIO_ServerToClientEvents {
  stateUpdate: (update: Uint8Array) => void;
}

export type SocketIO_Headers = { [key: string]: string | undefined | null };
