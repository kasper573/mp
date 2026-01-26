import { graphql } from "@mp/api-service/client";
import { useQueryBuilder } from "@mp/api-service/client/tanstack-query";
import { GameAssetLoaderContext, GameClient } from "@mp/game-client";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/solid-router";
import { Suspense, createEffect } from "solid-js";
import { gameAssetLoader } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/use-game-state-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { createQuery } from "@tanstack/solid-query";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [stateClient, events] = useGameStateClient();
  const qb = useQueryBuilder();
  const myCharacterQuery = createQuery(() => ({
    ...qb.queryOptions(query),
  }));

  const myCharacterId = () => myCharacterQuery.data?.myCharacterId;

  // Auto joining as default character is a temporary solution until we have a proper character selection UI
  createEffect(() => {
    const characterId = myCharacterId();
    if (!characterId) {
      if (stateClient.characterId.get()) {
        events.gateway.leave();
      }
      stateClient.characterId.set(undefined);
    } else {
      stateClient.characterId.set(characterId);
      events.gateway.join(characterId);
    }
  });

  // Important to retrigger join when connection is re-established
  createEffect(() => {
    const characterId = myCharacterId();
    const isConnected = stateClient.isConnected.get();
    if (isConnected && characterId) {
      events.gateway.join(characterId);
    }
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
