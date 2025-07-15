import { Container, Matrix } from "@mp/graphics";
import { upsertMap } from "@mp/std";
import type { GlobalTileId, TiledObject } from "@mp/tiled-loader";
import { renderStaticTiles } from "./tile-renderer";
import type { TiledTextureLookup } from "./spritesheet";
import type { TileMeshInput } from "./tile-mesh-data";

export function createObjectRenderer(
  objects: TiledObject[],
  textureLookup: TiledTextureLookup,
): Container {
  // We only render objects that reference tiles via gid
  const renderGroups = new Map<GlobalTileId, TileMeshInput[]>();
  for (const obj of objects) {
    if (obj.gid !== undefined) {
      upsertMap(renderGroups, obj.gid, tiledObjectMeshInput(obj));
    }
  }

  const container = new Container({ isRenderGroup: true });
  for (const mesh of renderStaticTiles(renderGroups, textureLookup)) {
    container.addChild(mesh);
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
