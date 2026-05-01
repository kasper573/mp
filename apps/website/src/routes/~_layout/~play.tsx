import {
  GameAssetLoaderContext,
  GameClient,
  RiftClientContext,
  characterSignal,
  joinAsPlayer,
  type AutoRejoinIntent,
  type CharacterId,
} from "@mp/world";
import * as fixtures from "@mp/fixtures";
import { LoadingSpinner } from "@mp/ui";
import { signal } from "@mp/state";
import { useSignalEffect } from "@mp/state/react";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo } from "preact/compat";
import { gameAssetLoader } from "../../integrations/assets";
import { useRiftClient } from "../../integrations/use-rift-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const characterIdSignal = useMemo(
    () => signal<CharacterId | undefined>(undefined),
    [],
  );
  const intent = useMemo(
    () => (): AutoRejoinIntent | undefined => {
      const id = characterIdSignal.value;
      return id ? { mode: "player", characterId: id } : undefined;
    },
    [characterIdSignal],
  );

  const { client, characters } = useRiftClient(intent);

  const character = useMemo(
    () => characterSignal(client.world, characterIdSignal),
    [client, characterIdSignal],
  );

  useSignalEffect(() => {
    const first = characters.characters.value[0]?.id;
    if (first && characterIdSignal.value !== first) {
      characterIdSignal.value = first;
      joinAsPlayer(client, first);
    }
  });

  return (
    <Suspense fallback={<LoadingSpinner debugDescription="~play.tsx" />}>
      <RiftClientContext.Provider value={client}>
        <GameAssetLoaderContext.Provider value={gameAssetLoader}>
          <GameClient
            client={client}
            character={character}
            additionalDebugUi={<MiscDebugUi />}
            viewDistance={fixtures.viewDistance}
            interactive
          />
        </GameAssetLoaderContext.Provider>
      </RiftClientContext.Provider>
    </Suspense>
  );
}
