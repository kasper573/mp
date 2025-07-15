import type { ViewContainer } from "@mp/graphics";
import { Sprite } from "@mp/graphics";
import type { TiledObject } from "@mp/tiled-loader";
import type { TiledTextureLookup } from "./spritesheet";
import type { Pixel } from "@mp/std";

export function createObjectRenderer(
  obj: TiledObject,
  opt: {
    tileHeight: Pixel;
    textureLookup: TiledTextureLookup;
  },
): ViewContainer | undefined {
  const texture = opt.textureLookup(obj.gid);
  if (!texture) {
    // If no texture is found, this is not an object that should be rendered.
    return;
  }

  const { x, width, height, rotation } = obj;

  // For some reason tile objects are achored to the bottom of the tile
  // so we need to adjust the position to match the top left corner to align with the tile renderer.
  const y = obj.y - opt.tileHeight;

  switch (obj.objectType) {
    case "rectangle": {
      const s = new Sprite({ texture, x, y, width, height, rotation });
      s.zIndex = y;
      return s;
    }
  }

  throw new Error(
    `Unsupported object type: ${obj.objectType} for object ${obj.id}`,
  );
}
