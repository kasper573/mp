import { createFileRoute } from "@tanstack/react-router";
import {
  ctxAuthClient,
  GameAssetLoaderContext,
  GameStateClient,
  ioc,
  SpectatorClient,
  worldRoles,
} from "@mp/game/client";
import { useContext, useEffect, useMemo } from "preact/hooks";
import type { SelectOption } from "@mp/ui";
import { LoadingSpinner } from "@mp/ui";
import { Suspense } from "preact/compat";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { SocketContext } from "../../../integrations/socket";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";
import { miscDebugSettings } from "../../../signals/misc-debug-ui-settings";
import type { CharacterId } from "@mp/game/client";
import { useGameAssets } from "../../../integrations/assets";
import { useApi } from "@mp/api/sdk";
import { useQuery } from "@mp/query";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [worldRoles.spectate],
  }),
});

function RouteComponent() {
  const socket = useContext(SocketContext);
  const api = useApi();
  const auth = ioc.get(ctxAuthClient);
  const stateClient = useMemo(
    () =>
      new GameStateClient({ socket, settings: () => miscDebugSettings.value }),
    [socket],
  );

  useEffect(() => stateClient.start(), [stateClient]);

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
          />
        </GameAssetLoaderContext.Provider>
      </Suspense>
    </div>
  );
}
