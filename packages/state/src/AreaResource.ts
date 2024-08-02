import type { Vector, VectorLike } from "@mp/excalibur";
import { tiled, snapTileVector, type TiledResource } from "@mp/excalibur";
import type { DGraph } from "./findPath";
import type { FileReference } from "./FileReference";
import { dGraphFromTiled } from "./dGraphFromTiled";

export type AreaId = string & { __brand__: "AreaId" };

export class AreaResource {
  readonly start: Vector;
  private objects: tiled.PluginObject[];
  readonly dGraph: DGraph;
  readonly characterLayer: number;

  constructor(
    readonly id: AreaId,
    readonly tmxFile: FileReference, // TODO remove this
    readonly tiled: TiledResource,
  ) {
    const [startObj] = tiled.getObjectsByClassName("start");
    if (!startObj) {
      throw new Error("Areas must contain a start object");
    }

    const [layer] = this.tiled.getTileLayers("Characters");
    if (!layer) {
      throw new Error("Areas must contain a characters layer");
    }

    this.characterLayer = layer.order;
    this.start = snapTileVector(tiled.worldCoordToTile(startObj));
    this.objects = this.tiled.getObjectLayers().flatMap((l) => l.objects);
    this.dGraph = dGraphFromTiled(tiled);
  }

  hitTestObjects<Subject>(
    subjects: Iterable<Subject>,
    getTileCoordOfSubject: (s: Subject) => VectorLike,
  ) {
    return hitTestObjects(this.objects, subjects, (subject) =>
      this.tiled.tileCoordToWorld(getTileCoordOfSubject(subject)),
    );
  }
}

function* hitTestObjects<Subject>(
  objects: tiled.PluginObject[],
  subjects: Iterable<Subject>,
  getWorldCoordOfSubject: (s: Subject) => VectorLike,
): Generator<{ subject: Subject; object: tiled.PluginObject }> {
  for (const subject of subjects) {
    const worldPos = getWorldCoordOfSubject(subject);
    for (const object of objects) {
      if (hitTest(object, worldPos)) {
        yield { subject, object };
      }
    }
  }
}

function hitTest(obj: tiled.PluginObject, pos: VectorLike): boolean {
  if (obj instanceof tiled.Point) {
    // TODO test for snapped tile
    return obj.x === pos.x && obj.y === pos.y;
  }

  if (obj instanceof tiled.Ellipse) {
    const { x, y, width, height } = obj;
    const dx = x - pos.x;
    const dy = y - pos.y;
    const rx = width / 2;
    const ry = height / 2;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  if (obj instanceof tiled.Rectangle) {
    const { x, y, width, height } = obj;
    return (
      pos.x >= x && pos.x <= x + width && pos.y >= y && pos.y <= y + height
    );
  }

  return false;
}
