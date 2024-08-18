import { localToGlobalId, type GlobalTileId } from "@mp/tiled-loader";
import type { TileLayer, TiledMap } from "@mp/tiled-loader";
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
      let GID =
        data[dataOffset] |
        (data[dataOffset + 1] << 8) |
        (data[dataOffset + 2] << 16) |
        (data[dataOffset + 3] << 24);
      dataOffset += 4;

      // Read out the flags
      const flippedHorizontally = (GID & FLIPPED_HORIZONTALLY_FLAG) !== 0;
      const flippedVertically = (GID & FLIPPED_VERTICALLY_FLAG) !== 0;
      const flippedDiagonally = (GID & FLIPPED_DIAGONALLY_FLAG) !== 0;
      const rotatedHexagonal120 = (GID & ROTATED_HEXAGONAL_120_FLAG) !== 0;

      // Clear all four flags
      GID &= ~(
        FLIPPED_HORIZONTALLY_FLAG |
        FLIPPED_VERTICALLY_FLAG |
        FLIPPED_DIAGONALLY_FLAG |
        ROTATED_HEXAGONAL_120_FLAG
      );

      if (GID === 0) {
        // Skip empty tiles
        continue;
      }

      const match = tileLookup.get(GID);
      if (!match) {
        throw new Error(`Could not find tileset for GID ${GID}`);
      }

      const { tile, tileset } = match;
      tiles.push({
        gid: GID,
        x: x * map.tilewidth,
        y: y * map.tileheight,
        width: tile?.width ?? tileset.tilewidth ?? map.tilewidth,
        height: tile?.height ?? tileset.tileheight ?? map.tileheight,
        image: {
          url: tile?.image ?? tileset.image,
          height: tile?.imageheight ?? tileset.imageheight,
          width: tile?.imagewidth ?? tileset.imagewidth,
        },
        flippedHorizontally,
        flippedVertically,
        flippedDiagonally,
        rotatedHexagonal120,
      });
    }
  }

  return tiles;
}

export interface ResolvedTileImage {
  url: string;
  width: number;
  height: number;
}

export interface ResolvedTile {
  gid: GlobalTileId;
  x: number;
  y: number;
  width: number;
  height: number;
  image: ResolvedTileImage;
  flippedHorizontally: boolean;
  flippedVertically: boolean;
  flippedDiagonally: boolean;
  rotatedHexagonal120: boolean;
}

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;
