import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { GameAssetLoaderContext, GameClient } from "@mp/game-client";
import type { CharacterId } from "@mp/game-shared";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/solid-router";
import { Suspense, createEffect } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { gameAssetLoader } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/use-game-state-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [stateClient, events] = useGameStateClient();
  const qb = useQueryBuilder();
  const queryResult = createQuery(() => ({
    ...qb.queryOptions(query),
    select: (res: { myCharacterId: string | null }) => res.myCharacterId,
  }));

  // Auto joining as default character is a temporary solution until we have a proper character selection UI
  // Read ALL reactive dependencies upfront to ensure proper tracking
  createEffect(() => {
    // Read these first to ensure they're tracked
    const status = queryResult.status;
    const charId = queryResult.data;
    const error = queryResult.error;
    const isConnected = stateClient.isConnected.get();

    // Handle join/leave logic
    if (status === "success" && charId && isConnected) {
      stateClient.characterId.set(charId as CharacterId);
      events.gateway.join(charId as CharacterId);
    } else if (status === "success" && !charId) {
      if (stateClient.characterId.peek()) {
        events.gateway.leave();
      }
      stateClient.characterId.set(undefined);
    }

    // Track error for debugging
    void error;
  });

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
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

const query = graphql(`
  query PlayPage {
    myCharacterId
  }
`);
