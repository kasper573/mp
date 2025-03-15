import { type AreaResource } from "@mp-modules/area";
import { TiledRenderer } from "@mp/tiled-renderer";
import type { ParentProps } from "solid-js";
import { useContext, createEffect, createMemo, For, untrack } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext, useSpring, VectorSpring } from "@mp/engine";
import type { Vector } from "@mp/math";
import { rect_from_diameter, rect_hit_test, rect_offset, vec } from "@mp/math";
import { clientViewDistance } from "@mp/server";
import type { Pixel, Tile } from "@mp/std";
import { SyncClientContext } from "../../integrations/sync";
import { useAnimatedCoords } from "../../state/useAnimatedCoords";
import { Actor } from "./Actor";
import type { TileHighlightTarget } from "./TileHighlight";
import { TileHighlight } from "./TileHighlight";

export function AreaScene(props: ParentProps<{ area: AreaResource }>) {
  const engine = useContext(EngineContext);
  const world = useContext(SyncClientContext);

  const spritesheets = createQuery(() => ({
    queryKey: ["tiled-spritesheets", props.area.id],
    queryFn: () => loadTiledMapSpritesheets(props.area.tiled.map),
  }));

  const myCoords = useAnimatedCoords(
    () => world.character()?.coords ?? vec(0 as Tile, 0 as Tile),
    () => world.character()?.path,
    () => world.character()?.speed ?? (0 as Tile),
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
      clientViewDistance.renderedTileCount,
    ),
  );

  const pointerTile = createMemo(() =>
    props.area.tiled.worldCoordToTile(engine.pointer.worldPosition),
  );

  const entityAtPointer = createMemo(() =>
    world
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
        world.attack(entity.id);
      } else {
        const tileNode = props.area.graph.getNearestNode(pointerTile());
        if (tileNode) {
          world.move(tileNode.data.vector);
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
              <For each={world.actorsInArea()}>
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
