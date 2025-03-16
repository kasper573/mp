import { EngineContext, useSpring, VectorSpring } from "@mp/engine";
import type { Vector } from "@mp/math";
import { vec, rect_hit_test, rect_offset, rect_from_diameter } from "@mp/math";
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
} from "solid-js";
import { createQuery } from "@mp/solid-trpc";
import { loadTiledMapSpritesheets, TiledRenderer } from "@mp/tiled-renderer";
import type { AreaResource } from "../../shared";
import { GameStateClientContext } from "../GameStateClient";
import { Actor } from "./Actor";
import type { TileHighlightTarget } from "./TileHighlight";
import { TileHighlight } from "./TileHighlight";
import { useAnimatedCoords } from "./useAnimatedCoords";

export function AreaScene(props: ParentProps<{ area: AreaResource }>) {
  const engine = useContext(EngineContext);
  const state = useContext(GameStateClientContext);
  const { renderedTileCount } = useContext(AreaSceneContext);

  const spritesheets = createQuery(() => ({
    queryKey: ["tiled-spritesheets", props.area.id],
    queryFn: () => loadTiledMapSpritesheets(props.area.tiled.map),
  }));

  const myCoords = useAnimatedCoords(
    () => state.character()?.coords ?? vec(0 as Tile, 0 as Tile),
    () => state.character()?.path,
    () => state.character()?.speed ?? (0 as Tile),
  );

  const myWorldPos = createMemo(() =>
    props.area.tiled.tileCoordToWorld(myCoords()),
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
        rect_hit_test(rect_offset(actor.hitBox, actor.coords), pointerTile()),
      ),
  );

  const highlightTarget = createMemo((): TileHighlightTarget | undefined => {
    const entity = entityAtPointer();
    if (entity) {
      return {
        type: "attack",
        rect: rect_offset(entity.hitBox, entity.coords),
      };
    } else {
      const tileNode = props.area.graph.getNearestNode(pointerTile());
      if (tileNode) {
        return {
          rect: rect_from_diameter(tileNode.data.vector, 1 as Tile),
          type: "move",
        };
      }
    }
  });

  createEffect(() => {
    if (engine.pointer.isDown) {
      const entity = untrack(entityAtPointer);
      if (entity) {
        void state.attack(entity.id);
      } else {
        const tileNode = props.area.graph.getNearestNode(pointerTile());
        if (tileNode) {
          state.move(tileNode.data.vector);
        }
      }
    }
  });

  createEffect(() => {
    engine.camera.update(props.area.tiled.mapSize, zoom(), cameraPos());
  });

  return (
    <Pixi
      label="AreaScene"
      sortableChildren
      matrix={engine.camera.transform.data}
    >
      {spritesheets.data && (
        <TiledRenderer
          layers={props.area.tiled.map.layers.filter(
            (l) => l.type !== "objectgroup",
          )}
          spritesheets={spritesheets.data}
          label={props.area.id}
        >
          {{
            [props.area.characterLayer.name]: () => (
              <For each={state.actorsInArea()}>
                {(actor) => <Actor tiled={props.area.tiled} actor={actor} />}
              </For>
            ),
          }}
        </TiledRenderer>
      )}
      {props.children}
      <TileHighlight area={props.area} target={highlightTarget()} />
    </Pixi>
  );
}

export const AreaSceneContext = createContext(
  new Proxy({} as { renderedTileCount: Tile }, {
    get() {
      throw new Error("AreaSceneContext not provided");
    },
  }),
);

function createZoomLevelForViewDistance(
  tileSize: Vector<Pixel>,
  cameraSize: Vector<Pixel>,
  tileViewDistance: Tile,
): number {
  return Math.max(
    cameraSize.x / tileSize.x / tileViewDistance,
    cameraSize.y / tileSize.y / tileViewDistance,
  );
}
