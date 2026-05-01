import { wsTransport } from "@rift/ws";
import { GameStateClient } from "@mp/game-client";
import { PartySocket } from "partysocket";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { env } from "../env";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import { AuthContext, LoggerContext } from "./contexts";

export function useGameStateClient(): GameStateClient {
  const logger = useContext(LoggerContext);
  const auth = useContext(AuthContext);

  const stateClient = useMemo(() => {
    const childLogger = logger.child({}, { msgPrefix: "[GameStateClient]" });
    const url = new URL(env.gameServerUrl);
    const ps = new PartySocket({
      host: url.host,
      protocol: url.protocol === "wss:" ? "wss" : "ws",
      path: url.pathname,
      query: () => ({ accessToken: auth.identity.value?.token ?? "" }),
    });
    return new GameStateClient({
      transport: wsTransport(ps),
      logger: childLogger,
      settings: () => ({
        useInterpolator: miscDebugSettings.value.useInterpolator,
      }),
    });
  }, [logger, auth]);

  useEffect(() => stateClient.start(), [stateClient]);

  return stateClient;
}
