import type { Vector } from "@mp/math";
import type { VectorTiledObjectUnion, Layer } from "@mp/tiled-loader";
import type { Pixel } from "@mp/std";
import { assert, type Tile } from "@mp/std";
import type { VectorGraph, VectorPathFinder } from "@mp/path-finding";
import type { TiledResource } from "./tiled-resource";
import { graphFromTiled } from "./graph-from-tiled";
import { TiledFixture } from "./tiled-fixture";
import { hitTestTiledObject } from "./hit-test-tiled-object";
import type { AreaId } from "./area-id";

export class AreaResource {
  readonly start: Vector<Tile>;
  private objects: Iterable<VectorTiledObjectUnion>;
  readonly graph: VectorGraph<Tile>;
  /**
   * The dynamic layer is a layer that expects the renderer
   * to dynamically sort its children based on their y position.
   * This is where moving entities like players and NPCs should be added,
   * but also static groups like large trees, houses, etc, anything that
   * should be grouped by their kind and then sorted by their combined y position.
   */
  readonly dynamicLayer: Layer;
  #findPath: VectorPathFinder<Tile>;

  constructor(
    readonly id: AreaId,
    readonly tiled: TiledResource,
  ) {
    this.dynamicLayer = assert(
      this.tiled.getTileLayers(dynamicLayerName)[0] as Layer | undefined,
      `Map must have a '${dynamicLayerName}' layer`,
    );

    this.objects = this.tiled.getObjects();
    this.graph = graphFromTiled(tiled);
    this.#findPath = this.graph.createPathFinder();

    const startObj = assert(
      tiled.getObjectsByClassName(TiledFixture.start)[0] as
        | VectorTiledObjectUnion
        | undefined,
      "Invalid area data: must have a start location",
    );

    this.start = tiled.worldCoordToTile(startObj.position).round();
  }

  findPath: VectorPathFinder<Tile> = (...args) =>
    AreaResource.findPathMiddleware(args, this.#findPath);

  findPathBetweenTiles(
    start: Vector<Tile>,
    end: Vector<Tile>,
  ): Vector<Tile>[] | undefined {
    const startNode = this.graph.getNearestNode(start);
    const endNode = this.graph.getNearestNode(end);
    if (!endNode || !startNode) {
      return; // Destination not reachable or start not connected to the graph
    }
    return this.findPath(startNode.id, endNode.id);
  }

  *hitTestObjects(
    candidates: Iterable<Vector<Pixel>>,
  ): Generator<VectorTiledObjectUnion> {
    for (const coord of candidates) {
      for (const object of this.objects) {
        if (hitTestTiledObject(object, coord)) {
          yield object;
        }
      }
    }
  }

  static findPathMiddleware = (
    args: Parameters<VectorPathFinder<Tile>>,
    next: VectorPathFinder<Tile>,
  ): ReturnType<VectorPathFinder<Tile>> => next(...args);
}

export function getAreaIdFromObject(
  object: VectorTiledObjectUnion,
): AreaId | undefined {
  const prop = object.properties.get("goto");
  return prop ? (prop.value as AreaId) : undefined;
}

const dynamicLayerName = "Dynamic";
