import { RiftClient } from "@rift/core";
import { GameStateClient } from "@mp/game-client";
import type { AuthClient } from "@mp/auth/client";
import { world } from "@mp/world";
import { createConsoleLogger } from "@mp/logger";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { env } from "../env";
import { AuthContext } from "./contexts";

const logger = createConsoleLogger();

export function useGameStateClient(): GameStateClient {
  const auth = useContext(AuthContext);

  const [stateClient, initialize] = useMemo(
    () => createGameStateClient(auth),
    [auth],
  );

  useEffect(() => initialize(), [initialize]);
  useEffect(() => stateClient.start(), [stateClient]);

  return stateClient;
}

function createGameStateClient(
  auth: AuthClient,
): [GameStateClient, () => () => void] {
  const url = new URL(env.gameServiceUrl);
  url.searchParams.set("accessToken", auth.identity.value?.token ?? "");

  const socket = new WebSocket(url.toString());
  socket.binaryType = "arraybuffer";

  const rift = new RiftClient(world);
  const stateClient = new GameStateClient({ socket, rift });

  function initialize() {
    const onError = (e: Event) => logger.error(e, "Socket error");
    socket.addEventListener("error", onError);

    return () => {
      socket.removeEventListener("error", onError);
      socket.close();
    };
  }

  return [stateClient, initialize];
}
