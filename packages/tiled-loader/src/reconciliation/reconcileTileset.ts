import type { LoaderContext } from "../context";
import type { LocalTileId } from "../schema/common";
import type { Tileset, TilesetTile } from "../schema/tileset";
import { reconcileFilePath } from "./reconcileFilePath";

export async function reconcileTileset(
  context: LoaderContext,
  tileset: Tileset | TilesetFile,
): Promise<Tileset> {
  const { basePath, loadJson, relativePath } = context;

  // The tileset data may actually be a file reference
  if ("source" in tileset) {
    const { source, firstgid } = tileset;
    const absPath = relativePath(source, basePath);
    const json = (await loadJson(absPath)) as object;
    context = { ...context, basePath: absPath };
    tileset = { ...json, firstgid } as Tileset;
  }

  // File paths are relative in the original data and need to be resolved
  tileset.image = reconcileFilePath(context, tileset.image);

  // The original tileset data is a list of tiles, but we want them mapped by GID
  tileset.tiles = new Map();
  for (const tile of (tileset as unknown as UnresolvedTileset).tiles) {
    tileset.tiles.set(tile.id, tile);
  }

  // The original data also omits empty tiles, so we need to fill in the gaps.
  for (let id = 0 as LocalTileId; id < tileset.tilecount; id++) {
    if (!tileset.tiles.has(id)) {
      tileset.tiles.set(id, { id });
    }
  }

  return tileset;
}

type UnresolvedTileset = Omit<Tileset, "tiles"> & {
  tiles: TilesetTile[];
};

interface TilesetFile {
  source: string;
  firstgid: number;
}
