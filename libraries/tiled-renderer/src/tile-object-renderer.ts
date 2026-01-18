import type { Mesh } from "@mp/graphics";
import { tiledObjectTransform, type TiledObject } from "@mp/tiled-loader";
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
  return {
    width: t.width,
    height: t.height,
    transform: tiledObjectTransform(t),
  };
}
