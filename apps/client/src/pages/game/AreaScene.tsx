import { type AreaResource } from "@mp/data";
import { TiledRenderer } from "@mp/tiled-renderer";
import { useContext, createEffect, Index, Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { Pixi } from "@mp/solid-pixi";
import { EngineContext, useSpring, VectorSpring } from "@mp/engine";
import type { Vector } from "@mp/math";
import { vec_zero } from "@mp/math";
import { clientViewDistance } from "@mp/server";
import { SyncClientContext } from "../../integrations/sync";
import { useAnimatedCoords } from "../../state/useAnimatedCoords";
import { getTilePosition } from "../../state/getTilePosition";
import { AutoPositionedActor, ManuallyPositionedActor } from "./Actor";
import { TileHighlight } from "./TileHighlight";

export function AreaScene(props: { area: AreaResource }) {
  const engine = useContext(EngineContext);
  const world = useContext(SyncClientContext);

  const spritesheets = createQuery(() => ({
    queryKey: ["tiled-spritesheets", props.area.id],
    queryFn: () => loadTiledMapSpritesheets(props.area.tiled.map),
  }));

  const myCoords = useAnimatedCoords(world.character);

  const actorsInArea = createMemo(() =>
    [
      ...Object.values(world.worldState()?.characters ?? []),
      ...Object.values(world.worldState()?.npcs ?? []),
    ].filter((char) => char.areaId === props.area.id),
  );

  const myWorldPos = createMemo(() => {
    const coords = myCoords();
    return coords ? props.area.tiled.tileCoordToWorld(coords) : vec_zero;
  });

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
    const { tilePosition, isValidTarget } = getTilePosition(props.area, engine);
    if (engine.pointer.isDown && isValidTarget) {
      world.move(tilePosition);
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
              <Index each={actorsInArea()}>
                {(actor) => {
                  const isMe = () => actor().id === world.characterId();
                  return (
                    <>
                      <Show when={isMe()}>
                        <ManuallyPositionedActor
                          tileSize={props.area.tiled.tileSize}
                          position={myWorldPos()}
                        />
                      </Show>
                      <Show when={!isMe()}>
                        <AutoPositionedActor
                          tiled={props.area.tiled}
                          subject={actor()}
                        />
                      </Show>
                    </>
                  );
                }}
              </Index>
            ),
          }}
        </TiledRenderer>
      )}
      <TileHighlight area={props.area} />
    </Pixi>
  );
}

function createZoomLevelForViewDistance(
  tileSize: Vector,
  cameraSize: Vector,
  tileViewDistance: number,
) {
  return Math.max(
    cameraSize.x / tileSize.x / tileViewDistance,
    cameraSize.y / tileSize.y / tileViewDistance,
  );
}
