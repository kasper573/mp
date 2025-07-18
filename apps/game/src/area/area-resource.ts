import { Vector } from "@mp/math";
import type { LayerWithVectors, TiledObjectWithVectors } from "@mp/tiled-loader";
import type { Pixel } from "@mp/std";
import { assert, type Tile } from "@mp/std";
import type { VectorGraph } from "@mp/path-finding";
import type { TiledResource } from "./tiled-resource";
import { graphFromTiled } from "./graph-from-tiled";
import { TiledFixture } from "./tiled-fixture";
import { hitTestTiledObject } from "./hit-test-tiled-object";
import type { AreaId } from "./area-id";

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
  readonly dynamicLayer: LayerWithVectors;

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

  hitTestObjects(coord: Vector<Pixel>): TiledObjectWithVectors[] {
    const matches: TiledObjectWithVectors[] = [];
    for (const obj of this.tiled.objects) {
      if (hitTestTiledObject(obj, coord)) {
        matches.push(obj);
      }
    }
    return matches;
  }
}

export function getAreaIdFromObject(object: TiledObjectWithVectors): AreaId | undefined {
  const prop = object.properties.get("goto");
  return prop ? (prop.value as AreaId) : undefined;
}

export const dynamicLayerName = "Dynamic";
