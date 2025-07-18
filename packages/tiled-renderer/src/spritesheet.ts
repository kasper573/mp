import type {
  SpritesheetData,
  SpritesheetFrameData,
  Texture,
} from "@mp/graphics";
import { Assets, Spritesheet } from "@mp/graphics";
import type { FilePath, LocalTileId, Milliseconds } from "@mp/tiled-loader";
import {
  localToGlobalId,
  type GlobalTileId,
  type TiledMapWithVectors,
  type Tileset,
} from "@mp/tiled-loader";

export async function loadTiledMapSpritesheets(
  tiledMap: TiledMapWithVectors,
): Promise<TiledSpritesheetRecord> {
  const tilesetsByPath = await Promise.all(
    tiledMap.tilesets.map(
      async (tileset): Promise<[FilePath, TiledSpritesheet]> => [
        tileset.image,
        await loadTilesetSpritesheet(tileset, {
          width: tiledMap.tileSize.x,
          height: tiledMap.tileSize.y,
        }),
      ],
    ),
  );

  return Object.fromEntries<TiledSpritesheet>(tilesetsByPath);
}

export function createTilesetSpritesheetData(
  tileset: Tileset,
  tileSize: { width: number; height: number },
): TiledSpritesheetData {
  const tiles = [...tileset.tiles.values()];

  const animationsWithDuration = new Map(
    tiles
      .filter((tile) => tile.animation)
      .map((tile) => [
        localToGlobalId(tileset.firstgid, tile.id),
        (tile.animation?.frames ?? []).map((frame) => ({
          duration: frame.duration,
          id: localToGlobalId(tileset.firstgid, frame.tileid),
        })),
      ]),
  );

  return {
    frames: Object.fromEntries(
      tiles.map((tile) => createTileFrameData(tileset, tileSize, tile.id)),
    ),
    meta: {
      image: tileset.image,
      size: { w: tileset.imagewidth, h: tileset.imageheight },
      scale: 1,
    },
    animations: Object.fromEntries(
      [...animationsWithDuration.entries()].map(([id, frames]) => [
        String(id),
        frames.map((frame) => String(frame.id)),
      ]),
    ),
    animationsWithDuration,
  };
}

async function loadTilesetSpritesheet(
  tileset: Tileset,
  tileSize: { width: number; height: number },
): Promise<TiledSpritesheet> {
  const data: TiledSpritesheetData = createTilesetSpritesheetData(
    tileset,
    tileSize,
  );

  const texture = await Assets.load<Texture>(tileset.image);
  texture.source.scaleMode = "nearest";
  const ss = new Spritesheet(texture, data);

  await ss.parse();

  return ss;
}

function createTileFrameData(
  tileset: Tileset,
  tileSize: { width: number; height: number },
  tileId: LocalTileId,
): [GlobalTileId, SpritesheetFrameData] {
  const tileX = tileId % tileset.columns;
  const tileY = Math.floor(tileId / tileset.columns);

  const x = tileX * tileSize.width + tileset.margin + tileX * tileset.spacing;
  const y = tileY * tileSize.height + tileset.margin + tileY * tileset.spacing;
  const w = tileSize.width;
  const h = tileSize.height;

  return [
    localToGlobalId(tileset.firstgid, tileId),
    {
      frame: { x, y, w, h },
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    },
  ];
}

export function createTiledTextureLookup(
  spritesheets: TiledSpritesheetRecord,
): TiledTextureLookup {
  return (id) => {
    if (id === undefined) {
      return;
    }
    for (const ss of Object.values(spritesheets)) {
      const texture = ss.textures[id] as Texture | undefined;
      if (texture) {
        return texture;
      }
    }
  };
}

export type TiledTextureLookup = (gid?: GlobalTileId) => Texture | undefined;

export interface TiledSpritesheetRecord {
  [image: string]: TiledSpritesheet;
}

export type TiledSpritesheet = Spritesheet<TiledSpritesheetData>;

export type TiledSpritesheetData = Omit<SpritesheetData, "frames"> & {
  frames: Record<GlobalTileId, SpritesheetFrameData>;
  animationsWithDuration?: Map<
    GlobalTileId,
    Array<{ duration: Milliseconds; id: GlobalTileId }>
  >;
};
