import type { LoaderContext } from "../context.ts";
import type { LocalTileId } from "../schema/common.ts";
import type { Tileset, TilesetTile } from "../schema/tileset.ts";
import { reconcileFilePath } from "./reconcileFilePath.ts";
import { reconcileProperties } from "./reconcileProperties.ts";

export async function reconcileTileset(
  context: LoaderContext,
  tileset: Tileset | TilesetFile
): Promise<Tileset> {
  const { basePath, loadJson, relativePath } = context;

  // In the tiled file data a tileset may be defined as a file reference,
  // In which case we replace the data with that of the referenced file.
  if ("source" in tileset) {
    const { source, firstgid } = tileset;
    const absPath = relativePath(source, basePath);
    const json = (await loadJson(absPath)) as object;
    context = { ...context, basePath: absPath };
    tileset = { ...json, firstgid } as Tileset;
  }

  // Now that we know we're working with a tileset object,
  // we can proceed with reconciling its properties.

  tileset.image = reconcileFilePath(context, tileset.image);

  if (tileset.terrains) {
    for (const terrain of tileset.terrains) {
      reconcileProperties(terrain);
    }
  }

  if (tileset.wangsets) {
    for (const wangset of tileset.wangsets) {
      reconcileProperties(wangset);
    }
  }

  // The original tileset data is a list of tiles, but we want them mapped by GID
  const tiles = new Map<LocalTileId, TilesetTile>();
  for (const tile of (tileset as unknown as UnresolvedTileset).tiles ?? []) {
    reconcileProperties(tile);
    tiles.set(tile.id, tile);
  }

  // The original data also omits empty tiles, so we need to fill in the gaps.
  for (let id = 0 as LocalTileId; id < tileset.tilecount; id++) {
    if (!tiles.has(id)) {
      tiles.set(id, { id, properties: new Map() });
    }
  }

  tileset.tiles = tiles;

  return tileset;
}

type UnresolvedTileset = Omit<Tileset, "tiles"> & {
  tiles: TilesetTile[];
};

interface TilesetFile {
  source: string;
  firstgid: number;
}
