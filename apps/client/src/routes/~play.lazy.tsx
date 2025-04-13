import { createLazyFileRoute } from "@tanstack/solid-router";
import {
  AreaDebugUIContext,
  AreaSceneContext,
  createGameStateClient,
  Game,
  GameStateClientContext,
} from "@mp-modules/game/client";
import { clientViewDistance, webSocketTokenParam } from "@mp/server";
import { useTRPC } from "../integrations/trpc";
import { env } from "../env";
import { AuthBoundary } from "../ui/auth-boundary";

export const Route = createLazyFileRoute("/play")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthBoundary>
      <PlayPage />
    </AuthBoundary>
  );
}

function PlayPage() {
  const trpc = useTRPC();
  const serverVersion = trpc.system.buildVersion.createQuery();
  const sync = createGameStateClient((token) => {
    const url = new URL(env.wsUrl);
    url.searchParams.set(webSocketTokenParam, token);
    return url.toString();
  });

  return (
    <AreaDebugUIContext.Provider
      value={{
        serverVersion: () => serverVersion.data() ?? "unknown",
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
