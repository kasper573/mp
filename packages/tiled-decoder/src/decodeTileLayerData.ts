import {
  localToGlobalId,
  readGlobalIdBuffer,
  type GlobalTileId,
} from "@mp/tiled-loader";
import type { Pixel, TileLayer, TiledMap } from "@mp/tiled-loader";
import { decoders } from "./decoders";
import { decompressors } from "./decompressors";

export function decodeTileLayerData(
  layer: TileLayer,
  map: TiledMap,
): ResolvedTile[] {
  const { compression, encoding, data: rawData } = layer;

  const decode = decoders[encoding];
  const decompress = decompressors[compression];

  const data: Uint8Array =
    typeof rawData === "string"
      ? decompress(decode(rawData))
      : Uint8Array.from(rawData);

  let dataOffset = 0;

  const expectedDataSize = map.width * map.height * 4;
  if (data.length !== expectedDataSize) {
    throw new Error(
      `Expected data length of ${expectedDataSize}, but got ${data.length}`,
    );
  }

  const tileLookup = new Map(
    map.tilesets.flatMap((tileset) =>
      Array.from(tileset.tiles.values()).map((tile) => {
        const gid = localToGlobalId(tileset.firstgid, tile.id);
        return [gid, { tile, tileset }] as const;
      }),
    ),
  );

  const tiles: ResolvedTile[] = [];
  for (let y = 0; y < map.height; ++y) {
    for (let x = 0; x < map.width; ++x) {
      // Read the GID in little-endian byte order:
      const { gid, newOffset, flags } = readGlobalIdBuffer(data, dataOffset);
      dataOffset = newOffset;

      if (gid === 0) {
        // Skip empty tiles
        continue;
      }

      const match = tileLookup.get(gid);
      if (!match) {
        throw new Error(`Could not find tileset for GID ${gid}`);
      }

      const { tile, tileset } = match;
      tiles.push({
        gid,
        x: (x * map.tilewidth) as Pixel,
        y: (y * map.tileheight) as Pixel,
        width: (tile?.width ?? tileset.tilewidth ?? map.tilewidth) as Pixel,
        height: (tile?.height ?? tileset.tileheight ?? map.tileheight) as Pixel,
        image: {
          url: tile?.image ?? tileset.image,
          height: tile?.imageheight ?? tileset.imageheight,
          width: tile?.imagewidth ?? tileset.imagewidth,
        },
        ...flags,
      });
    }
  }

  return tiles;
}

export interface ResolvedTileImage {
  url: string;
  width: Pixel;
  height: Pixel;
}

export interface ResolvedTile {
  gid: GlobalTileId;
  x: Pixel;
  y: Pixel;
  width: Pixel;
  height: Pixel;
  image: ResolvedTileImage;
  flippedHorizontally: boolean;
  flippedVertically: boolean;
  flippedDiagonally: boolean;
  rotatedHexagonal120: boolean;
}
