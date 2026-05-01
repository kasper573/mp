import { GameAssetLoaderContext, GameClient } from "@mp/game-client";
import { LoadingSpinner } from "@mp/ui";
import { useSignalEffect } from "@mp/state/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "preact/compat";
import { gameAssetLoader } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/use-game-state-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const stateClient = useGameStateClient();

  // Auto-join the first available character once the list arrives.
  useSignalEffect(() => {
    const list = stateClient.characterList.value;
    const id = list[0]?.id;
    if (id && stateClient.characterId.value !== id) {
      stateClient.characterId.value = id;
      stateClient.joinAs(id);
    }
  });

  return (
    <Suspense fallback={<LoadingSpinner debugDescription="~play.tsx" />}>
      <GameAssetLoaderContext.Provider value={gameAssetLoader}>
        <GameClient
          stateClient={stateClient}
          additionalDebugUi={<MiscDebugUi stateClient={stateClient} />}
          interactive
        />
      </GameAssetLoaderContext.Provider>
    </Suspense>
  );
}
