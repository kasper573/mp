import { Container, Matrix } from "@mp/graphics";
import type { TiledObject } from "@mp/tiled-loader";
import { renderStaticTile } from "./tile-renderer";
import type { TiledTextureLookup } from "./spritesheet";
import type { TileMeshInput } from "./tile-mesh-data";

export function renderTileObjects(
  objects: TiledObject[],
  textureLookup: TiledTextureLookup,
): Container {
  const container = new Container({
    isRenderGroup: true,
    sortableChildren: true,
  });

  for (const obj of objects) {
    // We only render objects that reference tiles via gid
    const texture = textureLookup(obj.gid);
    if (texture) {
      // We can't utilize the batched rendering since it doesn't support depth sorting.
      // So we render one mesh per object so we can assign the zIndex of each mesh.
      const mesh = renderStaticTile(texture, tiledObjectMeshInput(obj));
      mesh.zIndex = obj.y / texture.height; // Pixel -> Tile space
      container.addChild(mesh);
    }
  }

  return container;
}

export function tiledObjectMeshInput(t: TiledObject): TileMeshInput {
  const m = new Matrix();
  // Rotate around the bottom left corner (special requirement for tiled objects)
  m.translate(0, -t.height);
  m.rotate((t.rotation / 180) * Math.PI);

  // Now we can translate to the object position
  m.translate(t.x, t.y);

  return {
    width: t.width,
    height: t.height,
    transform: [m.a, m.b, m.c, m.d, m.tx, m.ty],
  };
}
