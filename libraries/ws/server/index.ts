import type { Options as ReconnectingWebSocketOptions } from "reconnecting-websocket";
import ReconnectingWebSocketImpl from "reconnecting-websocket";
import { WebSocket } from "ws";
export {
  WebSocketServer,
  type ServerOptions as WebSocketServerOptions,
} from "ws";

export type { ReconnectingWebSocketOptions };

export { WebSocket };

export class ReconnectingWebSocket extends ReconnectingWebSocketImpl {
  constructor(
    url: string,
    protocols?: string | string[],
    options?: ReconnectingWebSocketOptions,
  ) {
    // Preconfigure ReconnectingWebSocket to use the ws WebSocket implementation
    super(url, protocols, { WebSocket, ...options });
  }
}
