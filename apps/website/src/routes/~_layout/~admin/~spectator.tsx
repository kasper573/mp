import {
  characterEntitySignal,
  GameAssetLoaderContext,
  RiftContext,
  SpectatorClient,
  type AutoRejoinIntent,
  type CharacterId,
} from "@mp/world";
import * as fixtures from "@mp/fixtures";
import { gatewayRoles } from "@mp/keycloak";
import { signal } from "@mp/state";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo } from "preact/compat";
import { gameAssetLoader } from "../../../integrations/assets";
import { useRiftClient } from "../../../integrations/use-rift-client";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";
import { atoms } from "@mp/style";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [gatewayRoles.spectate],
  }),
});

function RouteComponent() {
  const spectatedId = useMemo(
    () => signal<CharacterId | undefined>(undefined),
    [],
  );
  const intent = useMemo(
    () => (): AutoRejoinIntent | undefined => {
      const id = spectatedId.value;
      return id ? { mode: "spectator", characterId: id } : undefined;
    },
    [spectatedId],
  );
  const { client, characters } = useRiftClient(intent);
  const characterEntity = useMemo(
    () => characterEntitySignal(client.world, spectatedId),
    [client, spectatedId],
  );

  const characterOptions: { value: CharacterId | undefined; label: string }[] =
    [
      { value: undefined, label: "Select character to spectate" },
      ...characters.characters.value.map((c) => ({
        value: c.id,
        label: c.name,
      })),
    ];

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
        <RiftContext.Provider value={client}>
          <GameAssetLoaderContext.Provider value={gameAssetLoader}>
            <div className={atoms({ mb: "xl" })}>
              Characters available: {characters.characters.value.length}
            </div>
            <SpectatorClient
              characterOptions={characterOptions}
              spectatedId={spectatedId}
              client={client}
              characterEntity={characterEntity}
              additionalDebugUi={<MiscDebugUi />}
              viewDistance={fixtures.viewDistance}
              interactive={false}
            />
          </GameAssetLoaderContext.Provider>
        </RiftContext.Provider>
      </Suspense>
    </div>
  );
}
