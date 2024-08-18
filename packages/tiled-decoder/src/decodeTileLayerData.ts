import type { Tile } from "@mp/tiled-loader";
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

      // Find the tileset that contains this tile
      for (let i = map.tilesets.length - 1; i >= 0; --i) {
        const tileset = map.tilesets[i];
        if (tileset.firstgid <= GID) {
          const LID = GID - tileset.firstgid;
          const tile = tileset.tiles?.get(LID);
          if (tile) {
            tiles.push({
              x,
              y,
              image: {
                image: tile.image ?? tileset.image,
                imageheight: tile.imageheight ?? tileset.imageheight,
                imagewidth: tile.imagewidth ?? tileset.imagewidth,
              },
              tile,
              flippedHorizontally,
              flippedVertically,
              flippedDiagonally,
              rotatedHexagonal120,
            });
            break;
          }
        }
      }
    }
  }

  return tiles;
}

export type ResolvedTileImage = Required<
  Pick<Tile, "image" | "imageheight" | "imagewidth">
>;

export interface ResolvedTile {
  x: number;
  y: number;
  image: ResolvedTileImage;
  tile: Omit<Tile, keyof ResolvedTileImage>;
  flippedHorizontally: boolean;
  flippedVertically: boolean;
  flippedDiagonally: boolean;
  rotatedHexagonal120: boolean;
}

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;
