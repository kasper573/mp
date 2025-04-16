import { EngineContext, useSpring, VectorSpring } from "@mp/engine";
import { Rect, Vector } from "@mp/math";

import { Pixi } from "@mp/solid-pixi";
import type { Tile, Pixel } from "@mp/std";
import type { ParentProps } from "solid-js";
import {
  useContext,
  createMemo,
  createEffect,
  untrack,
  For,
  createContext,
  Show,
  onCleanup,
  createResource,
} from "solid-js";
import { loadTiledMapSpritesheets, TiledRenderer } from "@mp/tiled-renderer";
import { GameStateClientContext, useGameActions } from "../game-state-client";
import type { AreaResource } from "../../shared/area/area-resource";
import { Actor } from "./actor";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";
import { useAnimatedCoords } from "./use-animated-coords";
import { RespawnDialog } from "./respawn-dialog";
import { AreaDebugUI } from "./area-debug-ui";
import { toggleSignal } from "./toggle-signal";

export function AreaScene(props: ParentProps<{ area: AreaResource }>) {
  const engine = useContext(EngineContext);
  const state = useContext(GameStateClientContext);
  const actions = useGameActions();
  const { renderedTileCount } = useContext(AreaSceneContext);
  const [debug, toggleDebug] = toggleSignal();

  const [spritesheets] = createResource(
    () => props.area.tiled.map,
    loadTiledMapSpritesheets,
  );

  const myCoords = useAnimatedCoords(
    () => state.character()?.coords ?? Vector.zero<Tile>(),
    () => state.character()?.path,
    () => state.character()?.speed ?? (0 as Tile),
  );

  const myWorldPos = createMemo(() =>
    props.area.tiled.tileCoordToWorld(
      state.character()?.coords ?? Vector.zero(),
    ),
  );

  const cameraPos = useSpring(
    new VectorSpring(myWorldPos, () => ({
      stiffness: 80,
      damping: 40,
      mass: 1,
      precision: 0.1,
    })),
  );

  const zoom = createMemo(() =>
    createZoomLevelForViewDistance(
      props.area.tiled.tileSize,
      engine.camera.cameraSize,
      renderedTileCount,
    ),
  );

  const pointerTile = createMemo(() =>
    props.area.tiled.worldCoordToTile(engine.pointer.worldPosition),
  );

  const entityAtPointer = createMemo(() =>
    state
      .actorsInArea()
      .find((actor) =>
        actor.hitBox.offset(actor.coords).contains(pointerTile()),
      ),
  );

  const highlightTarget = createMemo((): TileHighlightTarget | undefined => {
    const entity = entityAtPointer();
    if (entity) {
      return {
        type: "attack",
        rect: entity.hitBox.offset(entity.coords),
      };
    } else {
      const tileNode = props.area.graph.getNearestNode(pointerTile());
      if (tileNode) {
        return {
          rect: Rect.fromDiameter(tileNode.data.vector, 1 as Tile),
          type: "move",
        };
      }
    }
  });

  createEffect(() => {
    if (engine.pointer.isDown) {
      const entity = untrack(entityAtPointer);
      if (entity) {
        void actions.attack(entity.id);
      } else {
        const tileNode = props.area.graph.getNearestNode(pointerTile());
        if (tileNode) {
          actions.move(tileNode.data.vector);
        }
      }
    }
  });

  createEffect(() => {
    engine.camera.update(props.area.tiled.mapSize, zoom(), cameraPos());
  });

  return (
    <>
      <Pixi
        label="AreaScene"
        sortableChildren
        matrix={engine.camera.transform.data}
      >
        <Show when={spritesheets()} keyed>
          {(data) => (
            <TiledRenderer
              layers={props.area.tiled.map.layers.filter(
                (l) => l.type !== "objectgroup",
              )}
              spritesheets={data}
              label={props.area.id}
            >
              {{
                [props.area.characterLayer.name]: () => (
                  <For each={state.actorsInArea()}>
                    {(actor) => (
                      <Actor tiled={props.area.tiled} actor={actor} />
                    )}
                  </For>
                ),
              }}
            </TiledRenderer>
          )}
        </Show>
        {props.children}
        <TileHighlight area={props.area} target={highlightTarget()} />
        <Show when={debug()}>
          <AreaDebugUI
            area={props.area}
            playerCoords={myCoords()}
            drawPathsForActors={state.actorsInArea()}
          />
        </Show>
      </Pixi>

      <RespawnDialog open={!state.character()?.health} />

      <Keybindings toggleDebug={toggleDebug} />
    </>
  );
}

export const AreaSceneContext = createContext(
  new Proxy(
    {} as {
      renderedTileCount: Tile;
      networkFogOfWarTileCount: Tile;
    },
    {
      get() {
        throw new Error("AreaSceneContext not provided");
      },
    },
  ),
);

function createZoomLevelForViewDistance(
  tileSize: Vector<Pixel>,
  cameraSize: Vector<Pixel>,
  tileViewDistance: Tile,
): number {
  // Never show more tiles than the view distance on any axis
  const numTilesFitInCamera =
    cameraSize.x > cameraSize.y
      ? cameraSize.x / tileSize.x
      : cameraSize.y / tileSize.y;
  return numTilesFitInCamera / tileViewDistance;
}

function Keybindings(props: { toggleDebug: () => void }) {
  const engine = useContext(EngineContext);
  createEffect(() => {
    onCleanup(engine.keyboard.on("keydown", "F2", props.toggleDebug));
  });
  return null;
}
