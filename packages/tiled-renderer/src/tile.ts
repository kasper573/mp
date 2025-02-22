import { AnimatedSprite, Matrix, Sprite } from "@mp/pixi";
import type { GlobalIdFlags, TileLayerTile } from "@mp/tiled-loader";
import type { TextureLookup } from "./spritesheet.ts";

export function createTileSprite(
  { id, flags, x, y, width, height, tile }: TileLayerTile,
  lookup: TextureLookup,
): Sprite {
  let sprite: Sprite;
  if (tile.animation) {
    const anim = new AnimatedSprite({
      width,
      height,
      anchor: center,
      textures: lookup.animation(id),
    });
    anim.play();
    sprite = anim;
  } else {
    sprite = new Sprite({
      width,
      height,
      anchor: center,
      texture: lookup.texture(id),
    });
  }

  const m = createFlipMatrix(flags);
  m.translate(x * width + width / 2, y * height + height / 2);
  sprite.setFromMatrix(m);

  return sprite;
}

function createFlipMatrix(flags: GlobalIdFlags): Matrix {
  const m = new Matrix();

  if (flags.flippedDiagonally) {
    m.set(0, 1, 1, 0, 0, 0);
  }

  if (flags.flippedHorizontally) {
    m.scale(-1, 1);
  }

  if (flags.flippedVertically) {
    m.scale(1, -1);
  }

  if (flags.rotatedHexagonal120) {
    m.translate(0, -m.ty);
  }
  return m;
}

const center = { x: 0.5, y: 0.5 };
