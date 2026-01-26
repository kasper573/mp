import {
  createProxyEventInvoker,
  type MergeEventRouterNodes,
  type ProxyEventInvoker,
} from "@mp/event-router";
import { GameStateClient } from "@mp/game-client";
import type { GameServerEventRouter } from "@mp/game-service";
import { eventMessageEncoding } from "@mp/game-shared";
import type { GatewayRouter } from "@mp/gateway";
import type { Logger } from "@mp/logger";
import type { AuthClient } from "@mp/auth/client";
import { WebSocket } from "@mp/ws/client";
import { useContext } from "solid-js";
import { createEffect, onCleanup } from "solid-js";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import { AuthContext, LoggerContext } from "./contexts";

export type ComposedGameEventClient = ProxyEventInvoker<
  MergeEventRouterNodes<GameServerEventRouter, GatewayRouter>
>;

export function useGameStateClient(): [
  GameStateClient,
  ComposedGameEventClient,
] {
  const logger = useContext(LoggerContext);
  const auth = useContext(AuthContext);

  if (!logger || !auth) {
    throw new Error("Logger and Auth contexts must be provided");
  }

  const [stateClient, eventClient, initialize] = createGameStateClient(
    logger.child({}, { msgPrefix: "[GameStateClient]" }),
    auth,
  );

  createEffect(() => {
    const cleanup = initialize();
    onCleanup(cleanup);
  });

  createEffect(() => {
    const stop = stateClient.start();
    onCleanup(stop);
  });

  return [stateClient, eventClient];
}

function createGameStateClient(
  logger: Logger,
  auth: AuthClient,
): [GameStateClient, ComposedGameEventClient, () => () => void] {
  const socket = new WebSocket(() => {
    const url = new URL(env.gameServiceUrl);
    url.searchParams.set("accessToken", auth.identity.get()?.token ?? "");
    return url.toString();
  });
  socket.binaryType = "arraybuffer";


  const eventClient: ComposedGameEventClient = createProxyEventInvoker(
    (message) => {
      logger.debug("send", ...message);
      return socket.send(eventMessageEncoding.encode(message));
    },
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
    settings: () => miscDebugSettings.get(),
  });

  return [stateClient, eventClient, initialize];
}
