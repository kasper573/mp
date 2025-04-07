import { createFileRoute } from "@tanstack/solid-router";
import {
  AreaDebugUIContext,
  AreaSceneContext,
  createGameStateClient,
  Game,
  GameStateClientContext,
} from "@mp-modules/game/client";
import { clientViewDistance, webSocketTokenParam } from "@mp/server";
import { lazy } from "solid-js";
import { useTRPC } from "../integrations/trpc";
import { env } from "../env";
import { requireAuth } from "../ui/auth-boundary";

export const Route = createFileRoute("/play")({
  component: requireAuth(
    RouteComponent,
    lazy(() => import("./permission-denied")),
  ),
});

function RouteComponent() {
  const trpc = useTRPC();
  const sync = createGameStateClient((token) => {
    const url = new URL(env.wsUrl);
    if (token) {
      url.searchParams.set(webSocketTokenParam, token);
    }
    return url.toString();
  });
  const serverVersion = trpc.system.buildVersion.createQuery();
  return (
    <AreaDebugUIContext.Provider
      value={{
        serverVersion: () => serverVersion.data ?? "unknown",
        clientVersion: () => env.buildVersion,
      }}
    >
      <AreaSceneContext.Provider value={clientViewDistance}>
        <GameStateClientContext.Provider value={sync}>
          <Game />
        </GameStateClientContext.Provider>
      </AreaSceneContext.Provider>
    </AreaDebugUIContext.Provider>
  );
}
