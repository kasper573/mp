import { localToGlobalId, readGlobalIdBuffer } from "@mp/tiled-loader";
import type {
  Pixel,
  TileLayerTile,
  TileLayer,
  TiledMap,
  CompressedTileLayer,
  TileNumber,
} from "@mp/tiled-loader";
import { decoders, decompressors } from "@mp/transformer";

export function reconcileTileLayer(
  layer: TileLayer | CompressedTileLayer,
  map: TiledMap,
): TileLayerTile[] {
  if ("tiles" in layer) {
    return Object.values(layer.tiles);
  }

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
      Array.from(tileset.tiles.values()).map((tile) => {
        const gid = localToGlobalId(tileset.firstgid, tile.id);
        return [gid, { tile, tileset }] as const;
      }),
    ),
  );

  const tiles: TileLayerTile[] = [];
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
        id: gid,
        x: x as TileNumber,
        y: y as TileNumber,
        width: (tile?.width ?? tileset.tilewidth ?? map.tilewidth) as Pixel,
        height: (tile?.height ?? tileset.tileheight ?? map.tileheight) as Pixel,
        flags,
        tile,
        tileset,
      });
    }
  }

  return tiles;
}
