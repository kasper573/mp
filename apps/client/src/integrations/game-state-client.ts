import {
  EventTransceiver,
  createProxyEventInvoker,
  type ProxyEventInvoker,
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

import { env } from "../env";
import { useEffect, useMemo } from "preact/hooks";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import type { Logger } from "@mp/logger";
import type { AuthClient } from "@mp/auth/client";
import { computed } from "@mp/state";

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
  const socket = createWebSocket(env.gameServiceUrl);
  const transceiver = new EventTransceiver({
    send: socket.send.bind(socket),
  });
  const eventClient: ComposedGameEventClient = createProxyEventInvoker(
    transceiver.send,
  );
  const accessToken = computed(() => auth.identity.value?.token);

  function sendAccessTokenToGateway() {
    if (accessToken.value) {
      eventClient.gateway.auth(accessToken.value);
    }
  }

  function initialize() {
    const logSocketError = (e: Event) => logger.error(e, "Socket error");
    socket.addEventListener("error", logSocketError);
    const subscriptions = [
      ioc.register(ctxGameEventClient, eventClient),
      accessToken.subscribe(sendAccessTokenToGateway),
    ];

    return () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
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
