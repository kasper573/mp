import {
  AreaDebugUIContext,
  AreaSceneContext,
  createGameStateClient,
  Game,
  GameStateClientContext,
} from "@mp-modules/game/client";
import { clientViewDistance } from "@mp/server";
import { useTRPC } from "../integrations/trpc";
import { env } from "../env";

export default function PlayPage() {
  const trpc = useTRPC();
  const sync = createGameStateClient(env.wsUrl);
  const serverVersion = trpc.system.buildVersion.createQuery();
  return (
    <AreaDebugUIContext.Provider
      value={{
        serverVersion: () => serverVersion.data ?? "unknown",
        clientVersion: () => env.buildVersion,
      }}
    >
      <AreaSceneContext.Provider value={clientViewDistance}>
        <GameStateClientContext.Provider value={sync}>
          <Game />
        </GameStateClientContext.Provider>
      </AreaSceneContext.Provider>
    </AreaDebugUIContext.Provider>
  );
}
