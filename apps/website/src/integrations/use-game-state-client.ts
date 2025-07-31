import {
  createProxyEventInvoker,
  eventMessageEncoding,
  type MergeEventRouterNodes,
  type ProxyEventInvoker,
} from "@mp/event-router";
import { ctxAuthClient, GameStateClient, ioc } from "@mp/game-client";
import type { GameServerEventRouter } from "@mp/game-service";
import type { GatewayRouter } from "@mp/gateway";
import type { Logger } from "@mp/logger";
import type { AuthClient } from "@mp/oauth/client";
import { WebSocket } from "@mp/ws/client";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import { LoggerContext } from "./logger";

export type ComposedGameEventClient = ProxyEventInvoker<
  MergeEventRouterNodes<GameServerEventRouter, GatewayRouter>
>;

export function useGameStateClient(): [
  GameStateClient,
  ComposedGameEventClient,
] {
  const logger = useContext(LoggerContext);
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

    return () => {
      socket.removeEventListener("error", logSocketError);
      socket.close();
    };
  }

  const stateClient = new GameStateClient({
    socket,
    eventClient,
    logger,
    settings: () => miscDebugSettings.value,
  });

  return [stateClient, eventClient, initialize];
}
