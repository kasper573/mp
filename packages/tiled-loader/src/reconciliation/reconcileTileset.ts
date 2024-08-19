import { object, fallback } from "@mp/schema";
import type { LoaderContext } from "../context";
import { createEmptyTile } from "../loader";
import type { LocalTileId } from "../schema/common";
import { globalTileID } from "../schema/common";
import type { Tile } from "../schema/tile";
import type { Tileset } from "../schema/tileset";
import { reconcileFilePath } from "./reconcileFilePath";

export async function reconcileTileset(
  context: LoaderContext,
  tileset: Tileset,
): Promise<Tileset> {
  const { basePath, loadJson, relativePath } = context;
  const parseTilesetFile = object({
    firstgid: globalTileID,
    source: (value) => reconcileFilePath(context, value as string),
  });

  // The tileset data may actually be a file reference
  const tilesetFile = fallback(parseTilesetFile, undefined)(tileset);
  if (tilesetFile) {
    const { source, firstgid } = tilesetFile;
    const absPath = relativePath(source, basePath);
    const json = (await loadJson(absPath)) as object;
    context = { ...context, basePath: absPath };
    tileset = { ...json, firstgid } as Tileset;
  }

  // File paths are relative in the original data and need to be resolved
  tileset.image = reconcileFilePath(context, tileset.image);

  // The original tileset data is a list of tiles, but we want them mapped by GID
  tileset.tiles = new Map();
  for (const tile of tileset.tiles as unknown as Tile[]) {
    tileset.tiles.set(tile.id, tile);
  }

  // The original data also omits empty tiles, so we need to fill in the gaps.
  for (let id = 0 as LocalTileId; id < tileset.tilecount; id++) {
    if (!tileset.tiles.has(id)) {
      tileset.tiles.set(id, createEmptyTile(id));
    }
  }

  return tileset;
}
