import { createFileRoute } from "@tanstack/react-router";
import {
  ctxAuthClient,
  GameAssetLoaderContext,
  ioc,
  SpectatorClient,
  worldRoles,
} from "@mp/game/client";
import type { SelectOption } from "@mp/ui";
import { LoadingSpinner } from "@mp/ui";
import { Suspense } from "preact/compat";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";
import type { CharacterId } from "@mp/game/client";
import { useGameAssets } from "../../../integrations/assets";
import { useApi } from "@mp/api/sdk";
import { useQuery } from "@mp/query";
import { useGameStateClient } from "../../../integrations/game-state-client";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [worldRoles.spectate],
  }),
});

function RouteComponent() {
  const api = useApi();
  const auth = ioc.get(ctxAuthClient);
  const [stateClient, events] = useGameStateClient();

  const characterOptions = useQuery(
    api.characterList.queryOptions(void 0, {
      refetchInterval: 5000,
      enabled: !!auth.identity.value,
      select: (result): SelectOption<CharacterId>[] => [
        {
          value: undefined as unknown as CharacterId,
          label: "Select character",
        },
        ...result.items.map((char) => ({
          value: char.identity.id,
          label: char.appearance.name,
        })),
      ],
    }),
  );

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
        <GameAssetLoaderContext.Provider value={useGameAssets}>
          <SpectatorClient
            characterOptions={characterOptions.data ?? []}
            stateClient={stateClient}
            additionalDebugUi={<MiscDebugUi />}
            interactive={false}
            sendSpectateRequest={(characterId) =>
              events.gateway.spectate(characterId)
            }
          />
        </GameAssetLoaderContext.Provider>
      </Suspense>
    </div>
  );
}
