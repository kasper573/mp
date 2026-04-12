import { GameAssetLoaderContext, SpectatorClient } from "@mp/game-client";
import { gameServiceRoles } from "@mp/keycloak";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "preact/compat";
import { gameAssetLoader } from "../../../integrations/assets";
import { useGameStateClient } from "../../../integrations/use-game-state-client";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [gameServiceRoles.spectate],
  }),
});

function RouteComponent() {
  const stateClient = useGameStateClient();

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
            stateClient={stateClient}
            additionalDebugUi={<MiscDebugUi stateClient={stateClient} />}
            interactive={false}
          />
        </GameAssetLoaderContext.Provider>
      </Suspense>
    </div>
  );
}
