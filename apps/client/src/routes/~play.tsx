import { createFileRoute } from "@tanstack/solid-router";
import {
  BuildVersionContext,
  AreaSceneContext,
  createGameStateClient,
  Game,
  GameStateClientContext,
} from "@mp-modules/game/client";
import { clientViewDistance, webSocketTokenParam } from "@mp/server";
import { Suspense } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import { useTRPC } from "../integrations/trpc";
import { env } from "../env";
import { AuthBoundary } from "../ui/auth-boundary";

export const Route = createFileRoute("/play")({
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
    <BuildVersionContext.Provider
      value={{
        server: () => serverVersion.data ?? "unknown",
        client: () => env.buildVersion,
      }}
    >
      <AreaSceneContext.Provider value={clientViewDistance}>
        <GameStateClientContext.Provider value={sync}>
          {/* 
            It's important to have a suspense boundary here to avoid game resources suspending 
            all the way up to the routers pending component, which would unmount the page, 
            which in turn would stop the game client.
            */}
          <Suspense fallback={<LoadingSpinner />}>
            <Game />
          </Suspense>
        </GameStateClientContext.Provider>
      </AreaSceneContext.Provider>
    </BuildVersionContext.Provider>
  );
}
