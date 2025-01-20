import type { Vector } from "@mp/math";
import { vec_copy, vec_round } from "@mp/math";
import type { Layer, TiledObject } from "@mp/tiled-loader";
import type { Branded } from "@mp/std";
import type { VectorGraph, VectorPathFinder } from "@mp/path-finding";
import { type TiledResource } from "./TiledResource";
import { graphFromTiled } from "./graphFromTiled";
import { TiledFixture } from "./TiledFixture";
import { hitTestTiledObject } from "./hitTestTiledObject";

export type AreaId = Branded<string, "AreaId">;

export class AreaResource {
  readonly start: Vector;
  private objects: Iterable<TiledObject>;
  readonly graph: VectorGraph;
  readonly characterLayer: Layer;
  #findPath: VectorPathFinder;

  constructor(
    readonly id: AreaId,
    readonly tiled: TiledResource,
  ) {
    this.characterLayer = this.tiled.getTileLayers(characterLayerName)[0];

    if (!this.characterLayer) {
      throw new Error(`Map must have a '${characterLayerName}' layer`);
    }

    this.objects = this.tiled.getObjects();
    this.graph = graphFromTiled(tiled);
    this.#findPath = this.graph.createPathFinder();

    const [startObj] = tiled.getObjectsByClassName(TiledFixture.start);
    if (!startObj) {
      throw new Error("Invalid area data: must have a start location");
    }

    this.start = vec_round(tiled.worldCoordToTile(vec_copy(startObj)));
  }

  findPath: VectorPathFinder = (...args) =>
    AreaResource.findPathMiddleware(args, this.#findPath);

  hitTestObjects<Subject>(
    subjects: Iterable<Subject>,
    getTileCoordOfSubject: (s: Subject) => Vector,
  ) {
    return hitTestObjects(this.objects, subjects, (subject) =>
      this.tiled.tileCoordToWorld(getTileCoordOfSubject(subject)),
    );
  }

  // TODO replace this with an idiomatic monkeypatch based otel instrumentation. That will also allow tracing
  static findPathMiddleware = (
    args: Parameters<VectorPathFinder>,
    next: VectorPathFinder,
  ): ReturnType<VectorPathFinder> => next(...args);
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
