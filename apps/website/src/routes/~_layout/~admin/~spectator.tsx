import {
  graphql,
  useMapSubscription,
  useSubscription,
} from "@mp/api-service/client";
import { GameAssetLoaderContext, SpectatorClient } from "@mp/game-client";
import { gatewayRoles } from "@mp/keycloak";
import { useSignalEffect } from "@mp/state/react";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect } from "preact/compat";
import { gameAssetLoader } from "../../../integrations/assets";
import { useGameStateClient } from "../../../integrations/use-game-state-client";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [gatewayRoles.spectate],
  }),
});

function RouteComponent() {
  const [stateClient, events] = useGameStateClient();

  const online = useMapSubscription(
    useSubscription(sub),
    (data) => data.onlineCharacters,
  );

  const spectatedId = stateClient.characterId;
  const onlineCharacters = online
    .entries()
    .map(([id, { name }]) => ({ value: id, label: name }))
    .toArray();

  useSignalEffect(() => {
    // Important to subscribe to connected state to rejoin the gateway in case of a disconnect
    if (stateClient.isConnected.value && spectatedId.value) {
      events.gateway.spectate(spectatedId.value);
    } else {
      events.gateway.leave();
    }
  });

  const isSelectedOnline = onlineCharacters.find(
    ({ value }) => value === spectatedId.value,
  );
  useEffect(() => {
    if (!isSelectedOnline) {
      spectatedId.value = undefined;
    }
  }, [isSelectedOnline, spectatedId]);

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
            characterOptions={[
              {
                value: undefined as unknown as CharacterId,
                label: "Select character to spectate",
              },
              ...onlineCharacters,
            ]}
            stateClient={stateClient}
            additionalDebugUi={<MiscDebugUi stateClient={stateClient} />}
            interactive={false}
          />
        </GameAssetLoaderContext.Provider>
      </Suspense>
    </div>
  );
}

const sub = graphql(`
  subscription SpectatorCharacterSub {
    onlineCharacters {
      added {
        key
        value {
          name
        }
      }
      removed
    }
  }
`);
