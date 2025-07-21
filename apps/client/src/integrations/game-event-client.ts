import {
  BinaryEventTransceiver,
  createEventRouterProxyInvoker,
} from "@mp/event-router";
import type { GameEventClient } from "@mp/game/client";
import type { GameServerEventRouter } from "@mp/game/client";

export function createGameEventClient(socket: WebSocket): GameEventClient {
  const client = new BinaryEventTransceiver({
    send: (data) => socket.send(data),
  });

  return createEventRouterProxyInvoker<GameServerEventRouter>((path, input) =>
    client.send([path, input]),
  );
}
