import type { VectorLike } from "@mp/math";
import { Vector } from "@mp/math";
import type { VectorGraph } from "@mp/path-finding";
import type { Pixel } from "@mp/std";
import { assert, type Tile } from "@mp/std";
import type { Layer, TiledObject } from "@mp/tiled-loader";
import { graphFromTiled } from "./graph-from-tiled";
import { hitTestTiledObject } from "./hit-test-tiled-object";
import { TiledFixture } from "./tiled-fixture";
import type { TiledResource } from "./tiled-resource";
import { type } from "@mp/validate";

export class AreaResource {
  readonly start: Vector<Tile>;
  readonly graph: VectorGraph<Tile>;
  /**
   * The dynamic layer is a layer that expects the renderer
   * to dynamically sort its children based on their y position.
   * This is where moving entities like players and NPCs should be added,
   * but also static groups like large trees, houses, etc, anything that
   * should be grouped by their kind and then sorted by their combined y position.
   */
  readonly dynamicLayer: Layer;

  constructor(
    readonly id: AreaId,
    readonly tiled: TiledResource,
  ) {
    this.dynamicLayer = assert(
      this.tiled.map.layers.find((l) => l.name === dynamicLayerName),
      `Map must have a '${dynamicLayerName}' layer`,
    );

    this.graph = graphFromTiled(tiled);

    const startObj = assert(
      tiled.objects.find((obj) => obj.type === TiledFixture.start),
      "Invalid area data: must have a start location",
    );

    this.start = tiled.worldCoordToTile(Vector.from(startObj)).round();
  }

  hitTestObjects(coord: VectorLike<Pixel>): TiledObject[] {
    const matches: TiledObject[] = [];
    for (const obj of this.tiled.objects) {
      if (hitTestTiledObject(obj, coord)) {
        matches.push(obj);
      }
    }
    return matches;
  }
}

export function getAreaIdFromObject(object: TiledObject): AreaId | undefined {
  const prop = object.properties.get("goto");
  return prop ? (prop.value as AreaId) : undefined;
}

export const dynamicLayerName = "Dynamic";

/** @gqlScalar */
export type AreaId = typeof AreaIdType.infer;
export const AreaIdType = type("string").brand("AreaId");
