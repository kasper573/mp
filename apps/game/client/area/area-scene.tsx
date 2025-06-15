import { EngineContext, useSpring, VectorSpring } from "@mp/engine";
import type { Vector } from "@mp/math";
import { Rect } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import { type Tile, type Pixel, assert, dedupe, throttle } from "@mp/std";
import type { ParentProps } from "solid-js";
import {
  useContext,
  createMemo,
  createEffect,
  untrack,
  For,
  createContext,
} from "solid-js";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { TiledRenderer } from "@mp/tiled-renderer";
import { GameStateClientContext, useGameActions } from "../game-state-client";
import type { AreaResource } from "../../shared/area/area-resource";
import { Actor } from "../actor/actor";
import { GameDebugUiPortal } from "../debug/game-debug-ui-state";
import { AreaDebugUi } from "./area-debug-ui";
import type { TileHighlightTarget } from "./tile-highlight";
import { TileHighlight } from "./tile-highlight";
import { RespawnDialog } from "./respawn-dialog";

export function AreaScene(
  props: ParentProps<{
    area: AreaResource;
    spritesheets: TiledSpritesheetRecord;
  }>,
) {
  const engine = useContext(EngineContext);
  const state = useContext(GameStateClientContext);
  const actions = useGameActions();
  const { renderedTileCount } = useContext(AreaSceneContext);

  const myCoords = () => assert(state.character()).coords;

  const myWorldPos = createMemo(() =>
    props.area.tiled.tileCoordToWorld(myCoords()),
  );

  const cameraPos = useSpring(
    new VectorSpring<Pixel>(myWorldPos, () => ({
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
      .actorList()
      .find(
        (actor) =>
          actor.health > 0 &&
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

  const moveThrottled = dedupe(
    throttle((to: Vector<Tile>) => actions.move(to), 100),
    (a, b) => a.equals(b),
  );

  createEffect(() => {
    if (engine.pointer.isDown) {
      const entity = untrack(entityAtPointer);
      if (entity) {
        void actions.attack(entity.id);
      } else {
        const tileNode = props.area.graph.getNearestNode(pointerTile());
        if (tileNode) {
          moveThrottled(tileNode.data.vector);
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
        <TiledRenderer
          layers={props.area.tiled.map.layers.filter(
            (l) => l.type !== "objectgroup",
          )}
          spritesheets={props.spritesheets}
          label={props.area.id}
        >
          {{
            [props.area.dynamicLayer.name]: () => (
              <For each={state.actorList()}>
                {(actor) => (
                  <Actor
                    tiled={props.area.tiled}
                    actor={actor}
                    isPlayer={actor.id === state.characterId()}
                  />
                )}
              </For>
            ),
          }}
        </TiledRenderer>
        {props.children}
        <TileHighlight area={props.area} target={highlightTarget()} />
        <GameDebugUiPortal>
          <AreaDebugUi
            area={props.area}
            playerCoords={myCoords()}
            actors={state.actorList()}
          />
        </GameDebugUiPortal>
      </Pixi>

      <RespawnDialog open={(state.character()?.health ?? 0) <= 0} />
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
