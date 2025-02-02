import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import type { ParentProps } from "solid-js";
import { useContext, createEffect, createMemo, For } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext, useSpring, VectorSpring } from "@mp/engine";
import type { Vector } from "@mp/math";
import { vec } from "@mp/math";
import { clientViewDistance } from "@mp/server";
import type { Pixel, Tile } from "@mp/std";
import { SyncClientContext } from "../../integrations/sync";
import { Actor } from "./Actor";
import { TileHighlight } from "./TileHighlight";

export function AreaScene(props: ParentProps<{ area: AreaResource }>) {
  const engine = useContext(EngineContext);
  const world = useContext(SyncClientContext);

  const spritesheets = createQuery(() => ({
    queryKey: ["tiled-spritesheets", props.area.id],
    queryFn: () => loadTiledMapSpritesheets(props.area.tiled.map),
  }));

  const myWorldPos = createMemo(() =>
    props.area.tiled.tileCoordToWorld(
      world.character()?.coords ?? vec(0 as Tile, 0 as Tile),
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
      clientViewDistance.renderedTileCount,
    ),
  );

  createEffect(() => {
    const tileNode = props.area.graph.getNearestNode(
      props.area.tiled.worldCoordToTile(engine.pointer.worldPosition),
    );
    if (engine.pointer.isDown && tileNode) {
      world.move(tileNode.data.vector);
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
      <TileHighlight area={props.area} />
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
