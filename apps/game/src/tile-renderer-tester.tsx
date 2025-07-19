import type { Container, Size, Texture } from "@mp/graphics";
import { Assets, FpsIndicator, Spritesheet } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/react";
import { useState } from "preact/hooks";
import type { TiledSpritesheet } from "@mp/tiled-renderer";
import {
  createTiledTextureLookup,
  createTilesetSpritesheetData,
  TiledRenderer,
} from "@mp/tiled-renderer";
import { dynamicLayerName } from "./area/area-resource";
import type { GlobalTileId, LocalTileId } from "@mp/tiled-loader";
import type { Pixel, Tile } from "@mp/std";
import { Vector } from "@mp/math";
import { Checkbox, Select } from "@mp/ui";
import { useSignal, useSignalEffect } from "@mp/state/react";
import {
  generateRepeatedTileLayer,
  generateTileset,
  generateTilesetTile,
} from "./test-tile-map-generator";
import { skipToken, useQuery, useQuerySignal } from "@mp/rpc/react";
import testTilesetTextureUrl from "./tile-renderer-tester.tileset.png";

export function TileRendererTester() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const tileSize = useSignal(16 as Pixel);
  const mapSize = useSignal(1 as Tile);
  const fitToStage = useSignal(false);

  const texture = useQuery({
    queryKey: ["text-tileset-texture"],
    async queryFn() {
      const texture = await Assets.load<Texture>(testTilesetTextureUrl);
      texture.source.scaleMode = "nearest";
      return texture;
    },
  });

  const dependencies = useQuerySignal({
    queryKey: ["text-map-dependencies", mapSize.value, texture.data?.uid],
    queryFn: texture.data
      ? () =>
          generateMapDependencies(
            new Vector(mapSize.value, mapSize.value),
            new Vector(tileSize.value, tileSize.value),
            texture.data,
          )
      : skipToken,
  });

  const appSignal = useGraphics(container);

  useSignalEffect(() => {
    const app = appSignal.value;
    const { layer, spritesheet } = dependencies.signal.value ?? {};
    if (!app || !layer || !spritesheet) {
      return;
    }

    const fps = new FpsIndicator();
    fps.zIndex = Number.MAX_SAFE_INTEGER;

    const renderer = new TiledRenderer(
      [layer],
      dynamicLayerName,
      createTiledTextureLookup({ spritesheet }),
    );

    if (fitToStage.value) {
      fitObjectInto(renderer, app.canvas);
    }

    app.stage.addChild(fps);
    app.stage.addChild(renderer);
    return function cleanup() {
      renderer.destroy({ children: true });
      app.stage.removeChildren();
    };
  });

  return (
    <>
      <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        <label>
          Map size
          <Select options={sizeOptions} signal={mapSize} />
        </label>
        <span>(tile count: {mapSize.value * mapSize.value})</span>
        <label>
          fit tilemap to stage
          <Checkbox signal={fitToStage} />
        </label>
      </div>
      <div style={{ flex: 1 }} ref={setContainer} />
    </>
  );
}

async function generateMapDependencies(
  mapSize: Vector<Tile>,
  tileSize: Vector<Pixel>,
  tilesetTexture: Texture,
) {
  const tile = generateTilesetTile(0 as LocalTileId);
  const tileset = generateTileset(0 as GlobalTileId, [tile], tileSize);
  const layer = generateRepeatedTileLayer(mapSize, tileSize, tile, tileset);
  const data = createTilesetSpritesheetData(tileset, {
    width: tileSize.x,
    height: tileSize.y,
  });
  const spritesheet: TiledSpritesheet = new Spritesheet(tilesetTexture, data);
  await spritesheet.parse();
  return { layer, spritesheet };
}

const sizeOptions = [1, 10, 50, 100, 500, 1000, 2500];

function fitObjectInto(target: Container, container: Size): void {
  const xScale = container.width / target.width;
  const yScale = container.height / target.height;

  if (xScale < yScale) {
    target.scale.set(xScale);
  } else {
    target.scale.set(yScale);
  }
}
