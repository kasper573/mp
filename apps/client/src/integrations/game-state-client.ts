import {
  BinaryEventTransceiver,
  createEventRouterProxyInvoker,
  type EventRouterProxyInvoker,
  type MergeEventRouterNodes,
} from "@mp/event-router";
import {
  ctxAuthClient,
  ctxGameEventClient,
  ctxLogger,
  GameStateClient,
  ioc,
  type GameServerEventRouter,
} from "@mp/game/client";
import { createWebSocket } from "@mp/ws/client";
import type { GatewayRouter } from "@mp/gateway";
import { enhanceWebSocketWithAuthHandshake } from "./auth-handshake";
import { env } from "../env";
import { useEffect, useMemo } from "preact/hooks";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import type { Logger } from "@mp/logger";
import type { AuthClient } from "@mp/auth/client";

export type ComposedGameEventClient = EventRouterProxyInvoker<
  MergeEventRouterNodes<GameServerEventRouter, GatewayRouter>
>;

export function useGameStateClient(): [
  GameStateClient,
  ComposedGameEventClient,
] {
  const logger = ioc.get(ctxLogger);
  const auth = ioc.get(ctxAuthClient);

  const [stateClient, eventClient, initialize] = useMemo(
    () => createGameStateClient(logger, auth),
    [logger, auth],
  );

  useEffect(() => initialize(), [initialize]);
  useEffect(() => stateClient.start(), [stateClient]);

  return [stateClient, eventClient];
}

function createGameStateClient(
  logger: Logger,
  auth: AuthClient,
): [GameStateClient, ComposedGameEventClient, () => () => void] {
  const socketWithoutHandshake = createWebSocket(env.gameServiceUrl);
  const eventClientWithoutHandshake = createComposedGameEventClient(
    socketWithoutHandshake,
  );
  const socket = enhanceWebSocketWithAuthHandshake({
    logger,
    socket: socketWithoutHandshake,
    getAccessToken: () => auth.identity.value?.token,
    sendToken: (token) => eventClientWithoutHandshake.gateway.auth(token),
  });

  const eventClient = createComposedGameEventClient(socket);

  function initialize() {
    const logSocketError = (e: Event) => logger.error(e, "Socket error");
    socket.addEventListener("error", logSocketError);
    socket.addEventListener("close", socket.handleCloseEvent);
    const unsubscrube = ioc.register(ctxGameEventClient, eventClient);

    return () => {
      unsubscrube();
      socket.removeEventListener("error", logSocketError);
      socket.removeEventListener("close", socket.handleCloseEvent);
      socket.close();
    };
  }

  const stateClient = new GameStateClient({
    socket,
    eventClient,
    settings: () => miscDebugSettings.value,
  });

  return [stateClient, eventClient, initialize];
}

function createComposedGameEventClient(
  socket: WebSocket,
): ComposedGameEventClient {
  const client = new BinaryEventTransceiver({
    send: (data) => socket.send(data),
  });

  return createEventRouterProxyInvoker((path, input) =>
    client.send([path, input]),
  );
}
