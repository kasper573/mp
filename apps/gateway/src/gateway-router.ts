import { WebSocket } from "ws";
import type { Logger } from "@mp/logger";
import { AreaServerProxy } from "./area-server-proxy";

export interface AreaServerEndpoint {
  host: string;
  port: number;
}

export class GatewayRouter {
  private proxies = new Map<string, AreaServerProxy>();
  private clientConnections = new Set<WebSocket>();

  constructor(
    private areaServerConfig: Map<string, AreaServerEndpoint>,
    private logger: Logger,
  ) {
    // Create proxies for each area server
    for (const [areas, endpoint] of areaServerConfig) {
      const proxy = new AreaServerProxy(endpoint, logger);
      this.proxies.set(areas, proxy);
    }
  }

  handleConnection(clientWs: WebSocket) {
    this.clientConnections.add(clientWs);

    clientWs.on("close", () => {
      this.clientConnections.delete(clientWs);
    });

    clientWs.on("error", (err) => {
      this.logger.error(err, "Client WebSocket error");
    });

    clientWs.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.routeMessage(clientWs, message);
      } catch (err) {
        this.logger.error(err, "Failed to parse client message");
      }
    });
  }

  private routeMessage(clientWs: WebSocket, message: any) {
    // For now, route all messages to the island server
    // In a real implementation, this would determine the correct area server
    // based on the player's current area or the RPC call being made
    const areaServer = this.proxies.get("island");
    if (areaServer) {
      areaServer.forwardMessage(clientWs, message);
    } else {
      this.logger.error("No area server found for routing");
    }
  }

  async shutdown() {
    for (const proxy of this.proxies.values()) {
      await proxy.shutdown();
    }
  }
}