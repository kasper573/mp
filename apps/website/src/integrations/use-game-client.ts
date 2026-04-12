import { RiftClient } from "@rift/core";
import { GameClient } from "@rift/modular";
import type { AuthClient } from "@mp/auth/client";
import { world, modules } from "@mp/world";
import { createConsoleLogger } from "@mp/logger";
import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import { env } from "../env";
import { AuthContext } from "./contexts";

const logger = createConsoleLogger();

export function useGameClient(): GameClient | undefined {
  const auth = useContext(AuthContext);
  const [ready, setReady] = useState(false);

  const [client, socket] = useMemo(() => createGameClient(auth), [auth]);

  useEffect(() => {
    setReady(false);
    const onError = (e: Event) => logger.error(e, "Socket error");
    socket.addEventListener("error", onError);
    void client.start().then(() => setReady(true));

    return () => {
      client.dispose();
      socket.removeEventListener("error", onError);
      socket.close();
    };
  }, [client, socket]);

  return ready ? client : undefined;
}

function createGameClient(auth: AuthClient): [GameClient, WebSocket] {
  const url = new URL(env.gameServiceUrl);
  url.searchParams.set("accessToken", auth.identity.value?.token ?? "");

  const socket = new WebSocket(url.toString());
  socket.binaryType = "arraybuffer";

  const rift = new RiftClient(world);
  const client = new GameClient({ modules, rift, socket });

  return [client, socket];
}
