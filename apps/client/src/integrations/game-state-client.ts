import {
  createProxyEventInvoker,
  type ProxyEventInvoker,
  type MergeEventRouterNodes,
  eventMessageEncoding,
} from "@mp/event-router";
import {
  ctxAuthClient,
  ctxGameEventClient,
  ctxLogger,
  GameStateClient,
  ioc,
  type GameServerEventRouter,
} from "@mp/game/client";
import { WebSocket } from "@mp/ws/client";
import type { GatewayRouter } from "@mp/gateway";

import { env } from "../env";
import { useEffect, useMemo } from "preact/hooks";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import type { Logger } from "@mp/logger";
import type { AuthClient } from "@mp/auth/client";

export type ComposedGameEventClient = ProxyEventInvoker<
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
  const socket = new WebSocket(() => {
    const url = new URL(env.gameServiceUrl);
    url.searchParams.set("accessToken", auth.identity.value?.token ?? "");
    return url.toString();
  });
  socket.binaryType = "arraybuffer";

  const eventClient: ComposedGameEventClient = createProxyEventInvoker(
    (message) => socket.send(eventMessageEncoding.encode(message)),
  );

  function initialize() {
    const logSocketError = (e: Event) => logger.error(e, "Socket error");
    socket.addEventListener("error", logSocketError);
    const unregister = ioc.register(ctxGameEventClient, eventClient);

    return () => {
      unregister();
      socket.removeEventListener("error", logSocketError);
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
