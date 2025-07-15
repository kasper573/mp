import type { FillStyle, StrokeStyle, ViewContainer } from "@mp/graphics";
import { Graphics, Sprite } from "@mp/graphics";
import type { TiledObject } from "@mp/tiled-loader";
import type { TiledTextureLookup } from "./spritesheet";
import type { Pixel } from "@mp/std";

export function createObjectRenderer(
  obj: TiledObject,
  opt: {
    textureLookup: TiledTextureLookup;
    tileHeight: Pixel;
  },
): ViewContainer | undefined {
  const texture = opt.textureLookup(obj.gid);
  if (!texture) {
    // If no texture is found, this is not an object that should be rendered.
    return createDebugObjectRenderer(obj);
  }

  switch (obj.objectType) {
    case "rectangle": {
      // For some reason textured tile objects seem to be achored to the bottom of the tile, so we must offset the y position.
      return new Sprite({
        texture,
        ...obj,
        y: (obj.y - opt.tileHeight) as Pixel,
      });
    }
  }

  throw new Error(
    `Unsupported object type: ${obj.objectType} for object ${obj.id}`,
  );
}

function createDebugObjectRenderer(
  obj: TiledObject,
): ViewContainer | undefined {
  const g = new Graphics();
  switch (obj.objectType) {
    case "ellipse":
      g.ellipse(obj.x, obj.y, obj.width / 2, obj.height / 2);
      break;
    case "point":
      g.ellipse(obj.x, obj.y, 2, 2);
      break;
    case "polygon":
      g.moveTo(obj.x + obj.polygon[0].x, obj.y + obj.polygon[0].y);
      for (const point of obj.polygon) {
        g.lineTo(obj.x + point.x, obj.y + point.y);
      }
      break;
    case "polyline":
      g.moveTo(obj.x + obj.polyline[0].x, obj.y + obj.polyline[0].y);
      for (const point of obj.polyline) {
        g.lineTo(obj.x + point.x, obj.y + point.y);
      }
      break;
    case "rectangle":
      g.rect(obj.x, obj.y, obj.width, obj.height);
      break;
  }

  g.angle = obj.rotation;
  g.fill(fillStyle);
  g.stroke(strokeStyle);

  return g;
}

const strokeStyle: StrokeStyle = { width: 2, color: "rgba(150,150,150,0.9)" };
const fillStyle: FillStyle = { color: "rgba(100,100,100,0.5)" };
