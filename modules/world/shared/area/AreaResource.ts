import type { Vector } from "@mp/math";
import { vec_round } from "@mp/math";
import type { Layer, TiledObject } from "@mp/tiled-loader";
import type { Pixel, Tile } from "@mp/std";
import type { VectorGraph, VectorPathFinder } from "@mp/path-finding";
import { type TiledResource } from "./TiledResource";
import { graphFromTiled } from "./graphFromTiled";
import { TiledFixture } from "./TiledFixture";
import { hitTestTiledObject } from "./hitTestTiledObject";
import type { AreaId } from "./AreaId";

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

    this.start = vec_round(tiled.worldCoordToTile(startObj));
  }

  findPath: VectorPathFinder<Tile> = (...args) =>
    AreaResource.findPathMiddleware(args, this.#findPath);

  hitTestObjects<Subject>(
    subjects: Iterable<Subject>,
    getCoordOfSubject: (s: Subject) => Vector<Tile>,
  ) {
    return hitTestObjects(this.objects, subjects, (subject) =>
      this.tiled.tileCoordToWorld(getCoordOfSubject(subject)),
    );
  }

  // TODO replace this with an idiomatic monkeypatch based otel instrumentation. That will also allow tracing
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
