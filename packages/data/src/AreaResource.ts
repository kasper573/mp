import type { Vector } from "@mp/math";
import { vec_copy } from "@mp/math";
import type { Layer, TiledObject } from "@mp/tiled-loader";
import type { Branded } from "@mp/std";
import { snapTileVector, type TiledResource } from "./TiledResource";
import type { DNode, PathFinder } from "./findPath";
import { createPathFinder, vectorFromDNode, type DGraph } from "./findPath";
import { dGraphFromTiled } from "./dGraphFromTiled";
import { TiledFixture } from "./TiledFixture";
import { hitTestTiledObject } from "./hitTestTiledObject";

export type AreaId = Branded<string, "AreaId">;

export class AreaResource {
  readonly start: Vector;
  private objects: Iterable<TiledObject>;
  readonly dGraph: DGraph;
  readonly characterLayer: Layer;
  readonly #findPath: PathFinder;

  constructor(
    readonly id: AreaId,
    readonly tiled: TiledResource,
  ) {
    this.characterLayer = this.tiled.getTileLayers(characterLayerName)[0];

    if (!this.characterLayer) {
      throw new Error(`Map must have a '${characterLayerName}' layer`);
    }

    this.objects = this.tiled.getObjects();
    this.dGraph = dGraphFromTiled(tiled);
    this.#findPath = createPathFinder(this.dGraph);

    const [startObj] = tiled.getObjectsByClassName(TiledFixture.start);

    this.start = startObj
      ? snapTileVector(tiled.worldCoordToTile(vec_copy(startObj)))
      : vectorFromDNode(Object.keys(this.dGraph)[0] as DNode);
  }

  findPath: PathFinder = (...args) =>
    AreaResource.findPathMiddleware(args, this.#findPath);

  hitTestObjects<Subject>(
    subjects: Iterable<Subject>,
    getTileCoordOfSubject: (s: Subject) => Vector,
  ) {
    return hitTestObjects(this.objects, subjects, (subject) =>
      this.tiled.tileCoordToWorld(getTileCoordOfSubject(subject)),
    );
  }

  static findPathMiddleware = (
    args: Parameters<PathFinder>,
    next: PathFinder,
  ): ReturnType<PathFinder> => next(...args);
}

const characterLayerName = "Characters";

function* hitTestObjects<Subject>(
  objects: Iterable<TiledObject>,
  subjects: Iterable<Subject>,
  getWorldCoordOfSubject: (s: Subject) => Vector,
): Generator<{ subject: Subject; object: TiledObject }> {
  for (const subject of subjects) {
    const worldPos = getWorldCoordOfSubject(subject);
    for (const object of objects) {
      if (hitTestTiledObject(object, worldPos)) {
        yield { subject, object };
      }
    }
  }
}
