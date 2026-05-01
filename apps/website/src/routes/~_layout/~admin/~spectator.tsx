import { GameAssetLoaderContext, SpectatorClient } from "@mp/game-client";
import { systemRoles } from "@mp/keycloak";
import { useSignalEffect } from "@mp/state/react";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "preact/compat";
import { gameAssetLoader } from "../../../integrations/assets";
import { useGameStateClient } from "../../../integrations/use-game-state-client";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";
import { atoms } from "@mp/style";
import type { CharacterId } from "@mp/world";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [systemRoles.useDevTools],
  }),
});

function RouteComponent() {
  const stateClient = useGameStateClient();

  useSignalEffect(() => {
    if (stateClient.isConnected.value && stateClient.characterId.value) {
      stateClient.spectate(stateClient.characterId.value);
    }
  });

  const characterOptions = stateClient.characterList.value
    .map(({ id, name }) => ({ value: id, label: name }))
    .concat([
      {
        value: undefined as unknown as CharacterId,
        label: "Select character to spectate",
      },
    ]);

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
          <div className={atoms({ mb: "xl" })}>
            Characters available: {stateClient.characterList.value.length}
          </div>
          <SpectatorClient
            characterOptions={characterOptions}
            stateClient={stateClient}
            additionalDebugUi={<MiscDebugUi stateClient={stateClient} />}
            interactive={false}
          />
        </GameAssetLoaderContext.Provider>
      </Suspense>
    </div>
  );
}
