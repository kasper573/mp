export interface SocketIO_ServerToClientEvents {
  stateUpdate: (update: Uint8Array) => void;
}

export interface SocketIO_ClientToServerEvents {
  authenticate: (authToken: string) => void;
}
