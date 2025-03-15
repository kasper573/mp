import {
  AreaDebugUIContext,
  AreaSceneContext,
  createWorldSyncClient,
  Game,
  WorldSyncClientContext,
} from "@mp-modules/world/client";
import { clientViewDistance } from "@mp/server";
import { useTRPC } from "../integrations/trpc";
import { env } from "../env";

export default function PlayPage() {
  const trpc = useTRPC();
  const sync = createWorldSyncClient(env.wsUrl);
  const serverVersion = trpc.system.buildVersion.createQuery();
  return (
    <AreaDebugUIContext.Provider
      value={{
        serverVersion: () => serverVersion.data ?? "unknown",
        clientVersion: () => env.buildVersion,
      }}
    >
      <AreaSceneContext.Provider value={clientViewDistance}>
        <WorldSyncClientContext.Provider value={sync}>
          <Game interactive />
        </WorldSyncClientContext.Provider>
      </AreaSceneContext.Provider>
    </AreaDebugUIContext.Provider>
  );
}
