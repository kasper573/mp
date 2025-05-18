import { createFileRoute } from "@tanstack/solid-router";
import {
  clientViewDistance,
  GameDebugUiPortal,
  OptimisticGameStateContext,
} from "@mp/game/client";
import { Suspense, useContext } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import {
  BuildVersionContext,
  AreaSceneContext,
  createGameStateClient,
  Game,
  GameStateClientContext,
} from "@mp/game/client";
import { createStorageSignal } from "@mp/state";
import { SocketContext, useRpc } from "../integrations/rpc";
import { env } from "../env";
import { AuthBoundary } from "../ui/auth-boundary";
import { LoggerContext } from "../logger";
import type { MiscDebugSettings } from "../ui/misc-debug-ui";
import { MiscDebugUi } from "../ui/misc-debug-ui";

export const Route = createFileRoute("/play")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthBoundary>
      <PlayPage />
    </AuthBoundary>
  );
}

function PlayPage() {
  const logger = useContext(LoggerContext);
  const socket = useContext(SocketContext);
  const rpc = useRpc();
  const serverVersion = rpc.system.buildVersion.useQuery();

  const [settings, setSettings] = createStorageSignal<MiscDebugSettings>(
    localStorage,
    "misc-debug-settings",
    {
      useInterpolator: true,
      usePatchOptimizer: true,
      visualizeNetworkFogOfWar: false,
    },
  );

  const sync = createGameStateClient(socket, logger, settings);

  return (
    <BuildVersionContext.Provider
      value={{
        server: () => serverVersion.data ?? "unknown",
        client: () => env.buildVersion,
      }}
    >
      <AreaSceneContext.Provider value={clientViewDistance}>
        <GameStateClientContext.Provider value={sync}>
          {/* 
            It's important to have a suspense boundary here to avoid game resources suspending 
            all the way up to the routers pending component, which would unmount the page, 
            which in turn would stop the game client.
            */}
          <Suspense fallback={<LoadingSpinner debugId="PlayPage" />}>
            <OptimisticGameStateContext.Provider value={settings()}>
              <Game>
                <GameDebugUiPortal>
                  <MiscDebugUi
                    settings={settings()}
                    setSettings={setSettings}
                  />
                </GameDebugUiPortal>
              </Game>
            </OptimisticGameStateContext.Provider>
          </Suspense>
        </GameStateClientContext.Provider>
      </AreaSceneContext.Provider>
    </BuildVersionContext.Provider>
  );
}
