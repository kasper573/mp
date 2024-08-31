import { Vector } from "@mp/math";
import type { TiledObject } from "@mp/tiled-loader";
import { snapTileVector, type TiledResource } from "./TiledResource";
import type { DGraph } from "./findPath";
import { dGraphFromTiled } from "./dGraphFromTiled";
import type { Branded } from "./Branded";
import { TiledFixture } from "./TiledFixture";
import { hitTestTiledObject } from "./hitTestTiledObject";

export type AreaId = Branded<string, "AreaId">;

export class AreaResource {
  readonly start: Vector;
  private objects: Iterable<TiledObject>;
  readonly dGraph: DGraph;
  readonly characterLayerIndex: number;

  constructor(
    readonly id: AreaId,
    readonly tiled: TiledResource,
  ) {
    const [startObj] = tiled.getObjectsByClassName(TiledFixture.start);
    if (!startObj) {
      throw new Error("Areas must contain a start object");
    }

    const characterLayer = this.tiled.getTileLayers("Characters")[0];
    if (!characterLayer) {
      throw new Error("Areas must contain a characters layer");
    }

    this.characterLayerIndex = this.tiled.map.layers.indexOf(characterLayer);
    if (this.characterLayerIndex === -1) {
      throw new Error("Characters layer must be at top level");
    }

    this.start = snapTileVector(tiled.worldCoordToTile(Vector.from(startObj)));
    this.objects = this.tiled.getObjects();
    this.dGraph = dGraphFromTiled(tiled);
  }

  hitTestObjects<Subject>(
    subjects: Iterable<Subject>,
    getTileCoordOfSubject: (s: Subject) => Vector,
  ) {
    return hitTestObjects(this.objects, subjects, (subject) =>
      this.tiled.tileCoordToWorld(getTileCoordOfSubject(subject)),
    );
  }
}

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
