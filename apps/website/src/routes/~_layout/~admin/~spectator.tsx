import {
  AdditionalDebugUiContext,
  GameRenderer,
  joinAsSpectator,
  liveCharacters,
  MpRiftClient,
  type CharacterId,
} from "@mp/world";
import * as fixtures from "@mp/fixtures";
import { userRoles } from "@mp/keycloak";
import { useComputed, useSignal, useSignalEffect } from "@mp/state/react";
import { Select } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { gameAssetLoader } from "../../../integrations/assets";
import { AuthContext } from "../../../integrations/contexts";
import { env } from "../../../env";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";
import { atoms } from "@mp/style";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [userRoles.spectate],
  }),
});

function RouteComponent() {
  const auth = useContext(AuthContext);
  const spectatedId = useSignal<CharacterId | undefined>(undefined);

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
    const id = spectatedId.value;
    if (id) joinAsSpectator(client, id);
  });

  const spectatable = useComputed(() => {
    const me = auth.identity.value?.id;
    return liveCharacters(client.world.signal).value.filter(
      (c) => c.userId !== me,
    );
  });

  const characterOptions: { value: CharacterId | undefined; label: string }[] =
    [
      { value: undefined, label: "Select character to spectate" },
      ...spectatable.value.map((c) => ({ value: c.id, label: c.name })),
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
      <div className={atoms({ mb: "xl" })}>
        Characters available: {spectatable.value.length}
      </div>
      <Select<CharacterId | undefined>
        options={characterOptions}
        signal={spectatedId}
      />
      <AdditionalDebugUiContext.Provider value={miscDebugUi}>
        <GameRenderer
          client={client}
          assetLoader={gameAssetLoader}
          viewDistance={fixtures.viewDistance}
          interactive={false}
          enableUi={false}
        />
      </AdditionalDebugUiContext.Provider>
    </div>
  );
}

const miscDebugUi = <MiscDebugUi />;
