import { GameAssetLoaderContext, GameClient } from "@mp/world";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "preact/compat";
import { gameAssetLoader } from "../../integrations/assets";
import { useGameClient } from "../../integrations/use-game-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const client = useGameClient();

  if (!client) {
    return <LoadingSpinner debugDescription="~play.tsx initializing client" />;
  }

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugDescription="~play.tsx" />}>
      <GameAssetLoaderContext.Provider value={gameAssetLoader}>
        <GameClient
          client={client}
          additionalDebugUi={<MiscDebugUi />}
          interactive
        />
      </GameAssetLoaderContext.Provider>
    </Suspense>
  );
}
