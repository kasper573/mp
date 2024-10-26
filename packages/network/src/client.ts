import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_ServerToClientEvents,
} from "./socket";

export class SocketClient {
  private socket: Socket<
    SocketIO_ServerToClientEvents,
    SocketIO_ClientToServerEvents
  >;

  constructor(options: SocketClientOptions) {
    this.socket = io(options.url, { transports: ["websocket"] });
    this.socket.on("stateUpdate", options.applyStateUpdate);
    this.socket.on("connect", options.onConnect ?? noop);
    this.socket.on("disconnect", options.onDisconnect ?? noop);
  }

  authenticate(authToken: string) {
    this.socket.emit("authenticate", authToken);
  }

  dispose() {
    this.socket.disconnect();
  }
}

export interface SocketClientOptions {
  url: string;
  applyStateUpdate: (update: Uint8Array) => unknown;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

const noop = () => {};
