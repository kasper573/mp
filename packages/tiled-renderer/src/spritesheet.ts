import type {
  FrameObject,
  SpritesheetData,
  SpritesheetFrameData,
  Texture,
} from "@mp/graphics";
import { Assets, Spritesheet } from "@mp/graphics";
import type { FilePath, LocalTileId, Milliseconds } from "@mp/tiled-loader";
import {
  localToGlobalId,
  type GlobalTileId,
  type TiledMap,
  type Tileset,
} from "@mp/tiled-loader";

export async function loadTiledMapSpritesheets(
  tiledMap: TiledMap,
): Promise<TiledSpritesheetRecord> {
  const tilesetsByPath = await Promise.all(
    tiledMap.tilesets.map(
      async (tileset): Promise<[FilePath, TiledSpritesheet]> => [
        tileset.image,
        await loadTilesetSpritesheet(tileset, {
          width: tiledMap.tilewidth,
          height: tiledMap.tileheight,
        }),
      ],
    ),
  );

  return Object.fromEntries<TiledSpritesheet>(tilesetsByPath);
}

async function loadTilesetSpritesheet(
  tileset: Tileset,
  tileSize: { width: number; height: number },
): Promise<TiledSpritesheet> {
  const tiles = [...tileset.tiles.values()];

  const animationsWithDuration = new Map(
    tiles
      .filter((tile) => tile.animation)
      .map((tile) => [
        localToGlobalId(tileset.firstgid, tile.id),
        (tile.animation ?? []).map((frame) => ({
          duration: frame.duration,
          id: localToGlobalId(tileset.firstgid, frame.tileid),
        })),
      ]),
  );

  const data: TiledSpritesheetData = {
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
  return {
    texture(id) {
      for (const ss of Object.values(spritesheets)) {
        const texture = ss.textures[id] as Texture | undefined;
        if (texture) {
          return texture;
        }
      }
      throw new Error(
        `TiledSpritesheetRecord does not contain a texture for GID ${id}`,
      );
    },
    animation(id): FrameObject[] {
      for (const ss of Object.values(spritesheets)) {
        const frames = ss.data.animationsWithDuration?.get(id);
        if (frames) {
          return frames.map(({ duration, id }) => ({
            texture: ss.textures[id],
            time: duration,
          }));
        }
      }
      throw new Error(
        `TiledSpritesheetRecord does not contain an animation for GID ${id}`,
      );
    },
  };
}

export interface TiledTextureLookup {
  texture: (gid: GlobalTileId) => Texture;
  animation: (gid: GlobalTileId) => FrameObject[];
}

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
