import { FpsIndicator, type Application } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/react";
import { useState } from "preact/hooks";
import { skipToken, useQuery } from "@mp/rpc/react";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import {
  createTiledTextureLookup,
  loadTiledMapSpritesheets,
  TiledRenderer,
} from "@mp/tiled-renderer";
import { useTiledMap } from "./area/use-area-resource";
import type { AreaId } from "./area/area-id";
import { dynamicLayerName } from "./area/area-resource";
import type { LayerId, Ratio, TileLayer } from "@mp/tiled-loader";
import { tilesInLayers, type TiledMap } from "@mp/tiled-loader";
import type { Pixel, Tile } from "@mp/std";
import { assert } from "@mp/std";
import { Vector } from "@mp/math";
import { Range } from "@mp/ui";
import { useSignal } from "@mp/state/react";
import { effect, type Signal } from "@mp/state";

export function TileRendererTester() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const mapSize = useSignal(1 as Tile);
  const tiledMap = useTiledMap("single-water-tile" as AreaId);
  const spritesheets = useQuery({
    queryKey: ["test-renderer-area-spritesheets"],
    staleTime: Infinity,
    queryFn: tiledMap.data
      ? () => loadTiledMapSpritesheets(tiledMap.data)
      : skipToken,
  });

  useGraphics(
    container,
    {
      antialias: true,
      eventMode: "none",
      roundPixels: true,
      mapSize: mapSize,
      tiledMap: tiledMap.data,
      spritesheets: spritesheets.data,
    },
    buildStage,
  );

  return (
    <>
      <div>
        <Range label="map size" min={1} max={1000} step={1} signal={mapSize} />{" "}
        (tile count: {mapSize.value * mapSize.value})
      </div>
      <div style={{ flex: 1 }} ref={setContainer} />
    </>
  );
}

interface StageOptions {
  spritesheets?: TiledSpritesheetRecord;
  tiledMap?: TiledMap;
  mapSize: Signal<Tile>;
}

function buildStage(
  app: Application,
  { spritesheets, tiledMap, mapSize }: StageOptions,
) {
  if (!spritesheets || !tiledMap) {
    return;
  }

  const fps = new FpsIndicator();
  fps.zIndex = Number.MAX_SAFE_INTEGER;
  app.stage.addChild(fps);

  return effect(() => {
    const scaledMap = scaleUpTiledMap(
      tiledMap,
      new Vector(mapSize.value, mapSize.value),
    );

    const renderer = new TiledRenderer(
      scaledMap.layers,
      dynamicLayerName,
      createTiledTextureLookup(spritesheets),
    );

    app.stage.addChild(renderer);
    return function cleanup() {
      renderer.destroy({ children: true });
      app.stage.removeChild(renderer);
    };
  });
}

function scaleUpTiledMap(
  originalTiledMap: TiledMap,
  newMapSize: Vector<Tile>,
): TiledMap {
  const newTiledMap = { ...originalTiledMap };
  // 1. select the tile to repeat
  const tileToRepeat = assert(
    tilesInLayers(newTiledMap.layers).find(() => true),
  ); // Select the first, any will do.
  // 2. set the new size of the map
  newTiledMap.width = newMapSize.x;
  newTiledMap.height = newMapSize.y;
  // 3. create a new layer with the repeated tile
  const newTileLayer: TileLayer = {
    x: 0 as Tile,
    y: 0 as Tile,
    offsetx: 0 as Pixel,
    offsety: 0 as Pixel,
    parallaxx: 0 as Ratio,
    parallaxy: 0 as Ratio,
    width: newMapSize.x,
    height: newMapSize.y,
    id: 1 as LayerId,
    locked: false,
    name: "Autoscaled layer",
    opacity: 1 as Ratio,
    properties: new Map(),
    tiles: [],
    type: "tilelayer",
    visible: true,
  };
  for (let x = 0; x < newMapSize.x; x++) {
    for (let y = 0; y < newMapSize.y; y++) {
      newTileLayer.tiles.push({
        ...tileToRepeat,
        x: x as Tile,
        y: y as Tile,
      });
    }
  }
  // 4. replace existing layers with the new layer
  newTiledMap.layers = [newTileLayer];
  return newTiledMap;
}
