import { EngineContext, useSpring, VectorSpring } from "@mp/engine";
import { Vector } from "@mp/math";
import { Rect } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import { type Tile, type Pixel, dedupe, throttle } from "@mp/std";
import type { ParentProps } from "solid-js";
import { useContext, createMemo, createEffect, untrack, For } from "solid-js";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { TiledRenderer } from "@mp/tiled-renderer";
import type { ObjectId } from "@mp/tiled-loader";
import { GameStateClientContext, useGameActions } from "../game-state-client";
import {
  getAreaIdFromObject,
  type AreaResource,
} from "../../shared/area/area-resource";
import { Actor } from "../actor/actor";
import { GameDebugUiPortal } from "../debug/game-debug-ui-state";
import { clientViewDistance } from "../../server";
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
  const { renderedTileCount } = clientViewDistance;

  const myCoords = () => state.character()?.coords ?? Vector.zero();

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
    }

    const tileNode = props.area.graph.getNearestNode(pointerTile());
    if (tileNode) {
      return {
        rect: Rect.fromDiameter(tileNode.data.vector, 1 as Tile),
        type: "move",
      };
    }
  });

  const moveThrottled = dedupe(
    throttle(
      (to: Vector<Tile>, desiredPortalId?: ObjectId) =>
        actions.move(to, desiredPortalId),
      100,
    ),
    ([aVector, aPortalId], [bVector, bPortalId]) =>
      aVector.equals(bVector) && aPortalId === bPortalId,
  );

  createEffect(() => {
    if (engine.pointer.isDown) {
      const entity = untrack(entityAtPointer);
      if (entity) {
        void actions.attack(entity.id);
      } else {
        const tileNode = props.area.graph.getNearestNode(pointerTile());
        if (tileNode) {
          const portal = props.area
            .hitTestObjects([engine.pointer.worldPosition])
            .find(getAreaIdFromObject);

          moveThrottled(tileNode.data.vector, portal?.id);
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
