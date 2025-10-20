import { useApi } from "@mp/api-service/sdk";
import type { CharacterId } from "@mp/db/types";
import { GameAssetLoaderContext, SpectatorClient } from "@mp/game-client";
import { gatewayRoles } from "@mp/keycloak";
import { useQuery } from "@mp/query";
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
  const api = useApi();
  const auth = useContext(AuthContext);
  const [stateClient, events] = useGameStateClient();

  const characterOptions = useQuery(
    api.characterList.queryOptions(void 0, {
      refetchInterval: 5000,
      enabled: !!auth.identity.value,
      select: (characters): SelectOption<CharacterId>[] => [
        {
          value: undefined as unknown as CharacterId,
          label: "Select character",
        },
        ...characters.map((char) => ({
          value: char.id as CharacterId,
          label: char.name,
        })),
      ],
    }),
  );

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
      <Suspense fallback={<LoadingSpinner debugId="admin.spectator" />}>
        <GameAssetLoaderContext.Provider value={gameAssetLoader}>
          <SpectatorClient
            characterOptions={characterOptions.data ?? []}
            stateClient={stateClient}
            additionalDebugUi={<MiscDebugUi />}
            interactive={false}
          />
        </GameAssetLoaderContext.Provider>
      </Suspense>
    </div>
  );
}
