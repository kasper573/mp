import type { Tile } from "@mp/std";
import { localToGlobalId, readGlobalIdBuffer } from "../gid";
import type { Chunk } from "../schema/chunk";
import type { Compression, TiledData, Encoding } from "../schema/common";
import type {
  TileLayerTile,
  SharedLayerProperties,
  CommonTileLayerProperties,
} from "../schema/layer";
import type { TiledMap } from "../schema/map";
import { decoders, decompressors } from "../transformers";

export function decompressTileLayer(
  layer: CompressedTileLayer,
  map: TiledMap,
): TileLayerTile[] {
  const { compression, encoding, data: rawData } = layer;

  const decode = decoders[encoding];
  const decompress =
    compression in decompressors
      ? decompressors[compression as keyof typeof decompressors]
      : <T>(data: T) => data;

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
      [...tileset.tiles.values()].map((tile) => {
        const gid = localToGlobalId(tileset.firstgid, tile.id);
        return [gid, { tile, tileset }] as const;
      }),
    ),
  );

  const tiles: TileLayerTile[] = [];
  for (let y = 0 as Tile; y < map.height; y++) {
    for (let x = 0 as Tile; x < map.width; x++) {
      const { gid, newOffset, flags } = readGlobalIdBuffer(data, dataOffset);
      dataOffset = newOffset;

      if (gid === 0) {
        // Skip empty tiles
        continue;
      }

      const match = tileLookup.get(gid);
      if (!match) {
        throw new Error(
          [
            `Could not find tile for GID ${gid}`,
            `Layer: ${layer.name}, x: ${x}, y: ${y}`,
            `Number of tiles available: ${tileLookup.size}`,
          ].join("\n"),
        );
      }

      const { tile, tileset } = match;
      tiles.push({
        id: gid,
        x,
        y,
        width: map.tilewidth,
        height: map.tileheight,
        flags,
        tile,
        tileset,
      });
    }
  }

  return tiles;
}

export interface CompressedTileLayer
  extends SharedLayerProperties,
    CommonTileLayerProperties {
  chunks?: Chunk[];
  compression: Compression;
  data: TiledData;
  encoding: Encoding;
}

export function isCompressedTileLayer(
  layer: unknown,
): layer is CompressedTileLayer {
  return (
    layer !== null &&
    typeof layer === "object" &&
    "type" in layer &&
    layer.type === "tilelayer" &&
    "compression" in layer
  );
}
