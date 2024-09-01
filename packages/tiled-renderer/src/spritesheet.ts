import type {
  AnimatedSpriteFrames,
  SpritesheetData,
  SpritesheetFrameData,
  Texture,
} from "@mp/pixi";
import { Assets, Spritesheet } from "@mp/pixi";
import type { LocalTileId } from "@mp/tiled-loader";
import {
  localToGlobalId,
  type GlobalTileId,
  type TiledMap,
  type Tileset,
} from "@mp/tiled-loader";

export async function loadTiledMapSpritesheets(
  tiledMap: TiledMap,
): Promise<TiledSpritesheetRecord> {
  return Object.fromEntries(
    await Promise.all(
      tiledMap.tilesets.map(async (tileset) => [
        tileset.image,
        await loadTilesetSpritesheet(tileset, {
          width: tiledMap.tilewidth,
          height: tiledMap.tileheight,
        }),
      ]),
    ),
  );
}

async function loadTilesetSpritesheet(
  tileset: Tileset,
  tileSize: { width: number; height: number },
): Promise<TiledSpritesheet> {
  const tiles = Array.from(tileset.tiles.values());
  const data: TiledSpritesheetData = {
    frames: Object.fromEntries(
      tiles.map((tile) => createTileFrameData(tileset, tileSize, tile.id)),
    ),
    meta: {
      image: tileset.image,
      format: "RGBA8888", // TODO figure out what this should be
      size: { w: tileset.imagewidth, h: tileset.imageheight },
      scale: 1,
    },
    animations: Object.fromEntries(
      tiles
        .filter((tile) => tile.animation)
        .map((tile) => [
          stringOf(localToGlobalId(tileset.firstgid, tile.id)),
          tile.animation!.map((frame) =>
            stringOf(localToGlobalId(tileset.firstgid, frame.tileid)),
          ),
        ]),
    ),
  };

  const ss = new Spritesheet(await Assets.load(tileset.image), data);

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

export function createTextureLookup(
  spritesheets: TiledSpritesheetRecord,
): TextureLookup {
  return {
    texture(id) {
      for (const ss of Object.values(spritesheets)) {
        const texture = ss.textures[id];
        if (texture) {
          return texture;
        }
      }
      throw new Error(
        `TiledSpritesheetRecord does not contain a texture for GID ${id}`,
      );
    },
    animation(id) {
      const sid = stringOf(id);
      for (const ss of Object.values(spritesheets)) {
        const frames = ss.animations[sid];
        if (frames) {
          return frames;
        }
      }
      throw new Error(
        `TiledSpritesheetRecord does not contain an animation for GID ${id}`,
      );
    },
  };
}

export interface TextureLookup {
  texture: (gid: GlobalTileId) => Texture;
  animation: (gid: GlobalTileId) => AnimatedSpriteFrames;
}

export type TiledSpritesheetRecord = { [image: string]: TiledSpritesheet };

export type TiledSpritesheet = Spritesheet<TiledSpritesheetData>;

export type TiledSpritesheetData = Omit<
  SpritesheetData,
  "frames" | "animations"
> & {
  frames: Record<GlobalTileId, SpritesheetFrameData>;
  animations?: Record<GIDAsString, GIDAsString[]>;
};

type GIDAsString = `${GlobalTileId}`;

function stringOf<
  T extends string | number | bigint | boolean | null | undefined,
>(arg: T): `${T}` {
  return String(arg) as `${T}`;
}
