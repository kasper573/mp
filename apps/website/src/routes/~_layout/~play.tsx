import {
  AdditionalDebugUiContext,
  GameRenderer,
  joinAsPlayer,
  MpRiftClient,
  ownedCharacters,
} from "@mp/world";
import * as fixtures from "@mp/fixtures";
import { useSignalEffect } from "@mp/state/react";
import { createFileRoute } from "@tanstack/react-router";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { gameAssetLoader } from "../../integrations/assets";
import { AuthContext } from "../../integrations/contexts";
import { env } from "../../env";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const auth = useContext(AuthContext);

  const client = useMemo(
    () =>
      new MpRiftClient({
        url: env.gameServerUrl,
        accessToken: auth.identity.value?.token,
      }),
    [auth],
  );

  useEffect(() => {
    void client.connect();
    return () => void client.disconnect();
  }, [client]);

  useSignalEffect(() => {
    const first = ownedCharacters(client.world).value[0]?.id;
    if (first) joinAsPlayer(client, first);
  });

  return (
    <AdditionalDebugUiContext.Provider value={miscDebugUi}>
      <GameRenderer
        client={client}
        assetLoader={gameAssetLoader}
        viewDistance={fixtures.viewDistance}
        interactive
      />
    </AdditionalDebugUiContext.Provider>
  );
}

const miscDebugUi = <MiscDebugUi />;
