import type { Mesh } from "@mp/graphics";
import { Matrix } from "@mp/graphics";
import type { TiledObjectWithVectors } from "@mp/tiled-loader";
import { renderStaticTile } from "./tile-renderer";
import type { TiledTextureLookup } from "./spritesheet";
import type { TileMeshInput } from "./tile-mesh-data";

export function renderTileObject(
  obj: TiledObjectWithVectors,
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

export function tiledObjectMeshInput(t: TiledObjectWithVectors): TileMeshInput {
  const m = new Matrix();
  // Rotate around the bottom left corner (special requirement for tiled objects)
  m.translate(0, -t.size.y);
  m.rotate((t.rotation / 180) * Math.PI);

  // Now we can translate to the object position
  m.translate(t.position.x, t.position.y);

  // TODO process flags

  return {
    width: t.size.x,
    height: t.size.y,
    transform: [m.a, m.b, m.c, m.d, m.tx, m.ty],
  };
}
