import type { JSX, ParentProps } from "solid-js";
import {
  Switch,
  Match,
  Suspense,
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
} from "solid-js";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { skipToken, useQuery } from "@mp/rpc/solid";
import { useObservable, useStorage } from "@mp/state/solid";
import {
  ctxGameStateClient,
  type GameStateClient,
} from "../game-state/game-state-client";
import { useAreaResource } from "../area/use-area-resource";
import {
  ctxActorSpritesheetLookup,
  loadActorSpritesheets,
} from "../actor/actor-spritesheet-lookup";
import { GameDebugUi } from "../debug/game-debug-ui";
import type { GameDebugUiState } from "../debug/game-debug-ui-state";
import { GameDebugUiContext } from "../debug/game-debug-ui-state";
import { GameStateDebugInfo } from "../debug/game-state-debug-info";
import { ctxGameRpcClient } from "../game-rpc-client";
import { ioc } from "../context";
import { AreaUi } from "../area/area-ui";
import { areaDebugSettingsStorage } from "../area/area-debug-settings-form";
import { Effect } from "../effect";
import { GamePixiApplication } from "./game-pixi-application";

export type GameClientProps = ParentProps<{
  stateClient: GameStateClient;
  interactive?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}>;

export function GameClient(props: GameClientProps) {
  const rpc = ioc.get(ctxGameRpcClient);
  const [portalContainer, setPortalContainer] = createSignal<HTMLElement>();
  const [isDebugUiEnabled, setDebugUiEnabled] = createSignal(false);
  const interactive = () => props.interactive ?? true;

  const areaId = useObservable(() => props.stateClient.areaId);

  const area = useAreaResource(areaId);

  const areaSpritesheets = useQuery(() => ({
    queryKey: ["areaSpritesheets", area.data?.id],
    staleTime: Infinity,
    queryFn: area.data
      ? () => loadTiledMapSpritesheets(area.data.tiled.map)
      : skipToken,
  }));

  const actorSpritesheets = rpc.area.actorSpritesheetUrls.useQuery(() => ({
    input: void 0,
    map: loadActorSpritesheets,
    staleTime: Infinity,
  }));

  const assets = createMemo(() => {
    if (area.data && areaSpritesheets.data && actorSpritesheets.data) {
      return {
        area: area.data,
        areaSpritesheets: areaSpritesheets.data,
        actorSpritesheets: actorSpritesheets.data,
      };
    }
  });

  const debugUiState: GameDebugUiState = {
    portalContainer,
    setPortalContainer,
    enabled: isDebugUiEnabled,
    setEnabled: setDebugUiEnabled,
  };

  const isConnected = useObservable(() => props.stateClient.isConnected);

  createEffect(() => {
    onCleanup(ioc.register(ctxGameStateClient, props.stateClient));
  });

  const [areaDebugSettings, setAreaDebugSettings] = useStorage(
    areaDebugSettingsStorage,
  );

  return (
    <>
      <Switch>
        <Match when={assets()} keyed>
          {({ area, areaSpritesheets, actorSpritesheets }) => (
            <Suspense
              fallback={<LoadingSpinner>Loading renderer</LoadingSpinner>}
            >
              <Effect
                effect={() =>
                  ioc.register(ctxActorSpritesheetLookup, actorSpritesheets)
                }
              >
                <GameDebugUiContext.Provider value={debugUiState}>
                  <Suspense
                    fallback={<LoadingSpinner>Loading area</LoadingSpinner>}
                  >
                    <GamePixiApplication
                      class={props.class}
                      style={props.style}
                      interactive={interactive()}
                      gameState={props.stateClient.gameState}
                      debugUiState={debugUiState}
                      areaSceneOptions={{
                        area,
                        spritesheets: areaSpritesheets,
                        debugSettings: areaDebugSettings,
                      }}
                    />
                  </Suspense>
                  {props.children}
                  <AreaUi
                    debugFormProps={{
                      value: areaDebugSettings(),
                      onChange: setAreaDebugSettings,
                    }}
                  />
                  <GameDebugUi>
                    <GameStateDebugInfo tiled={area.tiled} />
                  </GameDebugUi>
                </GameDebugUiContext.Provider>
              </Effect>
            </Suspense>
          )}
        </Match>

        <Match when={!isConnected()}>
          <LoadingSpinner>Connecting to game server</LoadingSpinner>
        </Match>
        <Match when={!areaId()}>
          <LoadingSpinner>Waiting for game state</LoadingSpinner>
        </Match>
        <Match when={area.isLoading}>
          <LoadingSpinner>Loading area</LoadingSpinner>
        </Match>
        <Match when={!area.data}>
          <ErrorFallback
            error="Could not load area data"
            reset={() => void area.refetch()}
          />
        </Match>
      </Switch>
    </>
  );
}
