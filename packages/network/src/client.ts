import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import type { SocketIO_Headers } from "./socket";

export class SocketClient {
  private socket: Socket;

  constructor(options: SocketClientOptions) {
    this.socket = io(options.url, { transports: ["websocket"] });
    this.socket.on("stateUpdate", options.applyStateUpdate);
    this.socket.on("connect", options.onConnect ?? noop);
    this.socket.on("disconnect", options.onDisconnect ?? noop);
  }

  dispose() {
    this.socket.disconnect();
  }
}

export interface SocketClientState {
  connected: boolean;
  clientId?: Socket["id"];
}

export interface SocketClientOptions {
  url: string;
  applyStateUpdate: (update: Uint8Array) => unknown;
  getHeaders?: () =>
    | SocketIO_Headers
    | Promise<SocketIO_Headers | undefined>
    | undefined;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

const noop = () => {};
