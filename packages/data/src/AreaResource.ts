import { Vector } from "@mp/math";
import type { TiledObject } from "@mp/tiled-loader";
import { snapTileVector, type TiledResource } from "./TiledResource";
import type { DNode } from "./findPath";
import { vectorFromDNode, type DGraph } from "./findPath";
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
    const characterLayer = this.tiled.getTileLayers("Characters")[0];
    this.characterLayerIndex = characterLayer
      ? this.tiled.map.layers.indexOf(characterLayer)
      : this.tiled.map.layers.length;

    if (this.characterLayerIndex === -1) {
      throw new Error("Characters layer must be at top level");
    }

    this.objects = this.tiled.getObjects();
    this.dGraph = dGraphFromTiled(tiled);

    const [startObj] = tiled.getObjectsByClassName(TiledFixture.start);

    this.start = startObj
      ? snapTileVector(tiled.worldCoordToTile(Vector.from(startObj)))
      : vectorFromDNode(Object.keys(this.dGraph)[0] as DNode);
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
