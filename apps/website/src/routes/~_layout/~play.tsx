import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { GameAssetLoaderContext, GameClient } from "@mp/game-client";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect } from "preact/compat";
import { gameAssetLoader } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/use-game-state-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [stateClient, events] = useGameStateClient();
  const qb = useQueryBuilder();
  const { data: myCharacterId } = useQuery({
    ...qb.queryOptions(query),
    // Important to use connected state to requery when reconnecting
    enabled: stateClient.isConnected.value,
    select: (res) => res.myCharacterId,
  });

  // Auto joining as default character is a temporary solution until we have a proper character selection UI
  useEffect(() => {
    if (!myCharacterId) {
      if (stateClient.characterId.value) {
        events.gateway.leave(stateClient.characterId.value);
      }
      stateClient.characterId.value = undefined;
    } else {
      stateClient.characterId.value = myCharacterId;
      events.gateway.join(myCharacterId);
    }
  }, [myCharacterId, stateClient, events]);

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugDescription="~play.tsx" />}>
      <GameAssetLoaderContext.Provider value={gameAssetLoader}>
        <GameClient
          stateClient={stateClient}
          additionalDebugUi={<MiscDebugUi />}
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
