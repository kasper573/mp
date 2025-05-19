import { Vector } from "@mp/math";
import type { Layer, TiledObject } from "@mp/tiled-loader";
import { assert, type Pixel, type Tile } from "@mp/std";
import type { VectorGraph, VectorPathFinder } from "@mp/path-finding";
import { type TiledResource } from "./tiled-resource";
import { graphFromTiled } from "./graph-from-tiled";
import { TiledFixture } from "./tiled-fixture";
import { hitTestTiledObject } from "./hit-test-tiled-object";
import type { AreaId } from "./area-id";

export class AreaResource {
  readonly start: Vector<Tile>;
  private objects: Iterable<TiledObject>;
  readonly graph: VectorGraph<Tile>;
  readonly characterLayer: Layer;
  #findPath: VectorPathFinder<Tile>;

  constructor(
    readonly id: AreaId,
    readonly tiled: TiledResource,
  ) {
    this.characterLayer = assert(
      this.tiled.getTileLayers(characterLayerName)[0] as Layer | undefined,
      `Map must have a '${characterLayerName}' layer`,
    );

    this.objects = this.tiled.getObjects();
    this.graph = graphFromTiled(tiled);
    this.#findPath = this.graph.createPathFinder();

    const startObj = assert(
      tiled.getObjectsByClassName(TiledFixture.start)[0] as
        | TiledObject
        | undefined,
      "Invalid area data: must have a start location",
    );

    this.start = tiled.worldCoordToTile(Vector.from(startObj)).round();
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

  hitTestObjects<Subject>(
    subjects: Iterable<Subject>,
    getCoordOfSubject: (s: Subject) => Vector<Tile>,
  ) {
    return hitTestObjects(this.objects, subjects, (subject) =>
      this.tiled.tileCoordToWorld(getCoordOfSubject(subject)),
    );
  }

  static findPathMiddleware = (
    args: Parameters<VectorPathFinder<Tile>>,
    next: VectorPathFinder<Tile>,
  ): ReturnType<VectorPathFinder<Tile>> => next(...args);
}

const characterLayerName = "Characters";

function* hitTestObjects<Subject>(
  objects: Iterable<TiledObject>,
  subjects: Iterable<Subject>,
  getCoordOfSubject: (s: Subject) => Vector<Pixel>,
): Generator<{ subject: Subject; object: TiledObject }> {
  for (const subject of subjects) {
    const worldPos = getCoordOfSubject(subject);
    for (const object of objects) {
      if (hitTestTiledObject(object, worldPos)) {
        yield { subject, object };
      }
    }
  }
}
