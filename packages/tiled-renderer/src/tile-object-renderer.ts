import type { Mesh } from "@mp/graphics";
import { Matrix } from "@mp/graphics";
import type { TiledObject } from "@mp/tiled-loader";
import { renderStaticTile } from "./tile-renderer";
import type { TiledTextureLookup } from "./spritesheet";
import type { TileMeshInput } from "./tile-mesh-data";

export function renderTileObject(
  obj: TiledObject,
  textureLookup: TiledTextureLookup,
): Mesh | undefined {
  // We only render objects that reference tiles via gid
  const texture = textureLookup(obj.gid);
  if (texture) {
    // We can't utilize the batched rendering since our mesh renderer doesn't support depth sorting.
    // So we render one mesh per object so we can assign the zIndex of each mesh.
    return renderStaticTile(texture, [tiledObjectMeshInput(obj)]);
  }
}

export function tiledObjectMeshInput(t: TiledObject): TileMeshInput {
  const m = new Matrix();
  // Rotate around the bottom left corner (special requirement for tiled objects)
  m.translate(0, -t.height);
  m.rotate((t.rotation / 180) * Math.PI);

  // Now we can translate to the object position
  m.translate(t.x, t.y);

  // GID flags are not processed because we don't really use them,
  // but if we need them at some point you would process them here.

  return {
    width: t.width,
    height: t.height,
    transform: [m.a, m.b, m.c, m.d, m.tx, m.ty],
  };
}
