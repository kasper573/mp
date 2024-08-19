import type { SpritesheetData, SpritesheetFrameData, Texture } from "@mp/pixi";
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

export async function loadTilesetSpritesheet(
  tileset: Tileset,
  tileSize: { width: number; height: number },
): Promise<TiledSpritesheet> {
  const data: TiledSpritesheetData = {
    frames: Object.fromEntries(
      Array.from(tileset.tiles.values()).map((tile) =>
        createTileFrameData(tileset, tileSize, tile.id),
      ),
    ),
    meta: {
      image: tileset.image,
      format: "RGBA8888", // TODO figure out what this should be
      size: { w: tileset.imagewidth, h: tileset.imageheight },
      scale: 1,
    },
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

export function createTextureByGIDQuery(
  spritesheets: TiledSpritesheetRecord,
): TextureByGID {
  return (id) => {
    for (const ss of Object.values(spritesheets)) {
      const texture = ss.textures[id];
      if (texture) {
        return texture;
      }
    }
    throw new Error(
      `TiledSpritesheetRecord does not contain a texture for GID ${id}`,
    );
  };
}

export type TextureByGID = (gid: GlobalTileId) => Texture | undefined;

export type TiledSpritesheetRecord = { [image: string]: TiledSpritesheet };

export type TiledSpritesheet = Spritesheet<TiledSpritesheetData>;

export type TiledSpritesheetData = Omit<SpritesheetData, "frames"> & {
  frames: Record<GlobalTileId, SpritesheetFrameData>;
};
