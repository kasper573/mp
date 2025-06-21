import { createFileRoute } from "@tanstack/solid-router";
import { GameDebugUiPortal, PlayerClient } from "@mp/game/client";
import { Suspense, useContext } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import { createGameStateClient } from "@mp/game/client";
import { createStorageSignal } from "@mp/state";
import { SocketContext, useRpc } from "../integrations/rpc";
import { AuthBoundary } from "../ui/auth-boundary";
import { LoggerContext } from "../logger";
import type { MiscDebugSettings } from "../ui/misc-debug-ui";
import { MiscDebugUi } from "../ui/misc-debug-ui";

export const Route = createFileRoute("/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const logger = useContext(LoggerContext);
  const socket = useContext(SocketContext);
  const rpc = useRpc();

  const [settings, setSettings] = createStorageSignal<MiscDebugSettings>(
    localStorage,
    "misc-debug-settings",
    {
      useInterpolator: true,
      usePatchOptimizer: true,
      visualizeNetworkFogOfWar: false,
    },
  );

  const gameState = createGameStateClient(rpc, socket, logger, settings);

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugId="PlayPage" />}>
      <PlayerClient gameState={gameState}>
        <GameDebugUiPortal>
          <MiscDebugUi
            gameState={gameState}
            settings={settings()}
            setSettings={setSettings}
          />
        </GameDebugUiPortal>
      </PlayerClient>
    </Suspense>
  );
}
