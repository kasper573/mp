import { WebSocket } from "ws";
import type { Logger } from "@mp/logger";
import type { AreaServerEndpoint } from "./gateway-router";

export class AreaServerProxy {
  private serverWs: WebSocket | null = null;
  private clientSockets = new Set<WebSocket>();
  private messageQueue: Array<{ client: WebSocket; message: unknown }> = [];

  constructor(
    private endpoint: AreaServerEndpoint,
    private logger: Logger,
  ) {
    this.connect();
  }

  private connect() {
    try {
      this.serverWs = new WebSocket(
        `ws://${this.endpoint.host}:${this.endpoint.port}/ws`,
      );

      this.serverWs.on("open", () => {
        this.logger.info(
          `Connected to area server at ${this.endpoint.host}:${this.endpoint.port}`,
        );
        this.flushMessageQueue();
      });

      this.serverWs.on("message", (data) => {
        // Forward server message to all connected clients
        const message = data.toString();
        for (const client of this.clientSockets) {
          try {
            client.send(message);
          } catch (err) {
            this.logger.error(err, "Failed to forward message to client");
          }
        }
      });

      this.serverWs.on("close", () => {
        this.logger.warn(
          `Connection to area server ${this.endpoint.host}:${this.endpoint.port} closed`,
        );
        this.serverWs = null;
        // Attempt to reconnect after a delay
        setTimeout(() => this.connect(), 5000);
      });

      this.serverWs.on("error", (err) => {
        this.logger.error(err, `Area server connection error`);
      });
    } catch (err) {
      this.logger.error(err, "Failed to connect to area server");
      // Retry connection after a delay
      setTimeout(() => this.connect(), 5000);
    }
  }

  forwardMessage(clientWs: WebSocket, message: unknown) {
    this.clientSockets.add(clientWs);

    clientWs.on("close", () => {
      this.clientSockets.delete(clientWs);
    });

    if (this.serverWs && this.serverWs.readyState === WebSocket.OPEN) {
      try {
        this.serverWs.send(JSON.stringify(message));
      } catch (err) {
        this.logger.error(err, "Failed to forward message to area server");
      }
    } else {
      // Queue the message if server is not connected
      this.messageQueue.push({ client: clientWs, message });
    }
  }

  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      if (item) {
        this.forwardMessage(item.client, item.message);
      }
    }
  }

  shutdown() {
    if (this.serverWs) {
      this.serverWs.close();
    }
    this.clientSockets.clear();
    this.messageQueue.length = 0;
  }
}
