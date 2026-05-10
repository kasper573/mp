import {
  AdditionalDebugUiContext,
  GameRenderer,
  MpRiftClient,
  type CharacterId,
} from "@mp/world";
import * as fixtures from "@mp/fixtures";
import { userRoles } from "@mp/keycloak";
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

  const client = useMemo(
    () =>
      new MpRiftClient({
        url: env.gameServerUrl,
        accessToken: auth.identity.value?.token,
        mode: "spectator",
      }),
    [auth],
  );

  useEffect(() => {
    void client.connect();
    return () => void client.disconnect();
  }, [client]);

  const characterOptions: { value: CharacterId | undefined; label: string }[] =
    [
      { value: undefined, label: "Select character to spectate" },
      ...client.characters.signal.value.map((c) => ({
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
      <div className={atoms({ mb: "xl" })}>
        Characters available: {client.characters.signal.value.length}
      </div>
      <Select<CharacterId | undefined>
        options={characterOptions}
        signal={client.selectedCharacterId}
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
