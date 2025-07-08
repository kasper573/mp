import { ctxEngine, EngineProvider } from "@mp/engine";
import { Application, Pixi } from "@mp/solid-pixi";
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
import { useAtom, useStorage } from "@mp/state/solid";
import { createReactiveStorage } from "@mp/state";
import {
  ctxGameStateClient,
  type GameStateClient,
} from "../game-state/game-state-client";
import { AreaScene } from "../area/area-scene";
import { useAreaResource } from "../area/use-area-resource";
import {
  ActorSpritesheetContextProvider,
  loadActorSpritesheets,
} from "../actor/actor-spritesheet-lookup";
import { GameDebugUi } from "../debug/game-debug-ui";
import type { GameDebugUiState } from "../debug/game-debug-ui-state";
import { GameDebugUiContext } from "../debug/game-debug-ui-state";
import { GameStateDebugInfo } from "../debug/game-state-debug-info";
import { ctxGameRpcClient } from "../game-rpc-client";
import { ioc } from "../context";
import { AreaUi } from "../area/area-ui";
import type { AreaDebugSettings } from "../area/area-debug-settings-form";

export type GameClientProps = ParentProps<{
  gameState: GameStateClient;
  interactive?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}>;

export function GameClient(props: GameClientProps) {
  const rpc = ioc.get(ctxGameRpcClient);
  const [portalContainer, setPortalContainer] = createSignal<HTMLElement>();
  const [isDebugUiEnabled, setDebugUiEnabled] = createSignal(false);
  const interactive = () => props.interactive ?? true;

  const areaId = useAtom(props.gameState.areaId);

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
        spritesheets: areaSpritesheets.data,
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

  createEffect(() => {
    onCleanup(ioc.register(ctxGameStateClient, props.gameState));
  });

  const [areaDebugSettings, setAreaDebugSettings] = useStorage(
    createReactiveStorage<AreaDebugSettings>(
      localStorage,
      "area-debug-settings",
      {
        visibleGraphType: "none",
        showFogOfWar: false,
        showAttackRange: false,
        showAggroRange: false,
      },
    ),
  );

  return (
    <>
      <Switch>
        <Match when={assets()} keyed>
          {({ area, spritesheets, actorSpritesheets }) => (
            <Suspense
              fallback={<LoadingSpinner>Loading renderer</LoadingSpinner>}
            >
              <Application class={props.class} style={props.style}>
                {({ viewport }) => (
                  <ActorSpritesheetContextProvider value={actorSpritesheets}>
                    <EngineProvider
                      interactive={interactive()}
                      viewport={viewport}
                      ioc={ioc}
                    >
                      <GameDebugUiContext.Provider value={debugUiState}>
                        <Suspense
                          fallback={
                            <LoadingSpinner>Loading area</LoadingSpinner>
                          }
                        >
                          <Pixi
                            as={
                              new AreaScene({
                                area,
                                spritesheets,
                                debugSettings: areaDebugSettings(),
                              })
                            }
                          />
                        </Suspense>
                        <GameStateClientAnimations />
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
                    </EngineProvider>
                  </ActorSpritesheetContextProvider>
                )}
              </Application>
            </Suspense>
          )}
        </Match>

        <Match
          when={
            props.gameState.readyState.$getObservableValue() !== WebSocket.OPEN
          }
        >
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

// TODO refactor. This is a hack to workaround the problematic Application/EngineProvider pattern.
// It would be better if we could instantiate the engine higher up the tree so we can do this without a component.
function GameStateClientAnimations() {
  const client = ioc.get(ctxGameStateClient);
  const engine = ioc.get(ctxEngine);
  createEffect(() => {
    onCleanup(engine.frameEmitter.subscribe(client.gameState.frameCallback));
  });
  return null;
}
