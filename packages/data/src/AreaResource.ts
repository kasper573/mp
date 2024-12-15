import type { Vector } from "@mp/math";
import { vec_copy } from "@mp/math";
import type { Layer, TiledObject } from "@mp/tiled-loader";
import { snapTileVector, type TiledResource } from "./TiledResource.ts";
import type { DNode } from "./findPath.ts";
import { type DGraph, vectorFromDNode } from "./findPath.ts";
import { dGraphFromTiled } from "./dGraphFromTiled.ts";
import type { Branded } from "./Branded.ts";
import { TiledFixture } from "./TiledFixture.ts";
import { hitTestTiledObject } from "./hitTestTiledObject.ts";

export type AreaId = Branded<string, "AreaId">;

export class AreaResource {
  readonly start: Vector;
  private objects: Iterable<TiledObject>;
  readonly dGraph: DGraph;
  readonly characterLayer: Layer;

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

    const [startObj] = tiled.getObjectsByClassName(TiledFixture.start);

    this.start = startObj
      ? snapTileVector(tiled.worldCoordToTile(vec_copy(startObj)))
      : vectorFromDNode(Object.keys(this.dGraph)[0] as DNode);
  }

  hitTestObjects<Subject>(
    subjects: Iterable<Subject>,
    getTileCoordOfSubject: (s: Subject) => Vector,
  ): Generator<HitObject<Subject>> {
    return hitTestObjects(
      this.objects,
      subjects,
      (subject) => this.tiled.tileCoordToWorld(getTileCoordOfSubject(subject)),
    );
  }
}

const characterLayerName = "Characters";

function* hitTestObjects<Subject>(
  objects: Iterable<TiledObject>,
  subjects: Iterable<Subject>,
  getWorldCoordOfSubject: (s: Subject) => Vector,
): Generator<HitObject<Subject>> {
  for (const subject of subjects) {
    const worldPos = getWorldCoordOfSubject(subject);
    for (const object of objects) {
      if (hitTestTiledObject(object, worldPos)) {
        yield { subject, object };
      }
    }
  }
}

interface HitObject<Subject> {
  subject: Subject;
  object: TiledObject;
}
