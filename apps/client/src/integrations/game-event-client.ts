import type {
  EventRouterProxyInvoker,
  MergeEventRouterNodes,
} from "@mp/event-router";
import {
  BinaryEventTransceiver,
  createEventRouterProxyInvoker,
} from "@mp/event-router";
import type { GameServerEventRouter } from "@mp/game/client";
import type { GatewayRouter } from "@mp/gateway";
import { createContext } from "preact";

export type ComposedGameEventClient = EventRouterProxyInvoker<
  MergeEventRouterNodes<GameServerEventRouter, GatewayRouter>
>;

export function createGameEventClient(
  socket: WebSocket,
): ComposedGameEventClient {
  const client = new BinaryEventTransceiver({
    send: (data) => socket.send(data),
  });

  return createEventRouterProxyInvoker((path, input) =>
    client.send([path, input]),
  );
}

export const ComposedGameEventClientContext = createContext(
  new Proxy({} as ComposedGameEventClient, {
    get() {
      throw new Error("ComposedGameEventClientContext has not been provided");
    },
  }),
);
