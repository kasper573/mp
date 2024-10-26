import { localToGlobalId, readGlobalIdBuffer } from "@mp/tiled-loader";
import type {
  TileLayerTile,
  TiledMap,
  TileNumber,
  SharedLayerProperties,
  CommonTileLayerProperties,
  Chunk,
  Compression,
  TiledData,
  Encoding,
} from "@mp/tiled-loader";
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
  for (let y = 0 as TileNumber; y < map.height; y++) {
    for (let x = 0 as TileNumber; x < map.width; x++) {
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
