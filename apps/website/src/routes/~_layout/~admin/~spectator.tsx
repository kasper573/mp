import { graphql, useQueryBuilder } from "@mp/api-service/client";
import type { CharacterId } from "@mp/game-shared";
import { GameAssetLoaderContext, SpectatorClient } from "@mp/game-client";
import { gatewayRoles } from "@mp/keycloak";
import { useQuery } from "@tanstack/react-query";
import { useSignalEffect } from "@mp/state/react";
import type { SelectOption } from "@mp/ui";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useContext } from "preact/compat";
import { gameAssetLoader } from "../../../integrations/assets";
import { AuthContext } from "../../../integrations/contexts";
import { useGameStateClient } from "../../../integrations/use-game-state-client";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [gatewayRoles.spectate],
  }),
});

function RouteComponent() {
  const qb = useQueryBuilder();
  const auth = useContext(AuthContext);
  const [stateClient, events] = useGameStateClient();

  const characterOptions = useQuery({
    ...qb.queryOptions(query),
    refetchInterval: 5000,
    enabled: !!auth.identity.value,
    select: ({ characterList }): SelectOption<CharacterId>[] => [
      {
        value: undefined as unknown as CharacterId,
        label: "Select character",
      },
      ...characterList.map((char) => ({
        value: char.id,
        label: char.name,
      })),
    ],
  });

  useSignalEffect(() => {
    // Important to subscribe to connected state to rejoin the gateway in case of a disconnect
    if (stateClient.isConnected.value && stateClient.characterId.value) {
      events.gateway.spectate(stateClient.characterId.value);
    }
  });

  return (
    <div
      style={{
        padding: "32px",
        display: "flex",
        flexDirection: "column",
        flex: 1,
      }}
    >
      <Suspense fallback={<LoadingSpinner debugDescription="~spectator.tsx" />}>
        <GameAssetLoaderContext.Provider value={gameAssetLoader}>
          <SpectatorClient
            characterOptions={characterOptions.data ?? []}
            stateClient={stateClient}
            additionalDebugUi={<MiscDebugUi stateClient={stateClient} />}
            interactive={false}
          />
        </GameAssetLoaderContext.Provider>
      </Suspense>
    </div>
  );
}

const query = graphql(`
  query SpectatorCharacterList {
    characterList {
      id
      name
    }
  }
`);
