import { fallback, object } from "@mp/schema";
import type { LoaderContext } from "./context";
import type { TiledMap } from "./schema/map";
import type { FilePath, LocalTileId, Pixel } from "./schema/common";
import { globalTileID } from "./schema/common";
import type { Tileset } from "./schema/tileset";
import type { Tile } from "./schema/tile";
import type { Layer } from "./schema/layer";

export type CreateTiledLoaderOptions = Omit<LoaderContext, "basePath">;

export function createTiledLoader(options: CreateTiledLoaderOptions) {
  return async function loadTiled(mapPath: string): Promise<TiledLoaderResult> {
    const context: LoaderContext = {
      basePath: mapPath,
      ...options,
    };

    try {
      const tiledMap = (await context.loadJson(mapPath)) as TiledMap;
      for await (const _ of reconcileTiledMap(context, tiledMap));
      return { tiledMap };
    } catch (error) {
      return {
        error: `Error in ${mapPath}: ${error}`,
      };
    }
  };
}

export interface TiledLoaderResult {
  tiledMap?: TiledMap;
  error?: string;
}

/**
 * The original map data in the tiled files is mostly directly matching our
 * data structure but needs some adjustments to be fully compatible.
 */
async function* reconcileTiledMap(context: LoaderContext, map: TiledMap) {
  for (let i = 0; i < map.tilesets.length; i++) {
    yield await reconcileTileset(context, map.tilesets[i]).then((updated) => {
      map.tilesets[i] = updated;
    });
  }

  for (const layer of map.layers) {
    yield reconcileLayer(context, layer);
  }
}

async function* reconcileLayer(
  context: LoaderContext,
  layer: Layer,
): AsyncGenerator {
  switch (layer.type) {
    case "imagelayer":
      layer.image = reconcileFilePath(context, layer.image);
      break;
    case "objectgroup":
      for (const object of layer.objects) {
        if ("template" in object && object.tileset) {
          yield await reconcileTileset(context, object.tileset).then(
            (updated) => {
              object.tileset = updated;
            },
          );
        }
      }
      break;
    case "group":
      for (const child of layer.layers) {
        yield reconcileLayer(context, child);
      }
      break;
  }
}

async function reconcileTileset(
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

function reconcileFilePath(context: LoaderContext, path: string): FilePath {
  return context.relativePath(path, context.basePath) as FilePath;
}

function createEmptyTile(id: LocalTileId): Tile {
  return {
    id,
    x: 0 as Pixel,
    y: 0 as Pixel,
  };
}
