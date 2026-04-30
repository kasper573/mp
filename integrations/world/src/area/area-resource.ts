import type { VectorLike } from "@mp/math";
import { Vector } from "@mp/math";
import type { VectorGraph } from "@mp/path-finding";
import type { Pixel, Result } from "@mp/std";
import { assert, err, ok, TileType, type Tile } from "@mp/std";
import type { Layer, TiledObject } from "@mp/tiled-loader";
import { type } from "@mp/validate";
import { AreaIdType, type AreaId } from "../identity/ids";
import { graphFromTiled } from "./graph-from-tiled";
import { hitTestTiledObject } from "./hit-test";
import { TiledFixture } from "./tiled-fixture";
import type { TiledResource } from "./tiled-resource";

export class AreaResource {
  readonly start: Vector<Tile>;
  readonly graph: VectorGraph<Tile>;
  readonly dynamicLayer: Layer;
  readonly portals: ReadonlyArray<Portal>;

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

    const portals: Portal[] = [];
    for (const obj of tiled.objects) {
      const res = getDestinationFromObject(obj);
      if (!res) {
        continue;
      }
      if (res.isErr()) {
        throw new Error(
          `Area "${id}" tiled map has an invalid portal object "${obj.id}"`,
          {
            cause: res.error,
          },
        );
      }

      portals.push({ destination: res.value, object: obj });
    }

    this.portals = portals;

    this.start = tiled.worldCoordToTile(Vector.from(startObj)).round();
  }

  hitTestObjects(coord: VectorLike<Pixel>): TiledObject[] {
    const matches: TiledObject[] = [];
    for (const obj of this.tiled.objects) {
      if (hitTestTiledObject(obj, coord)) {
        matches.push(obj);
      }
    }
    return matches;
  }
}

export function getDestinationFromObject(
  object: TiledObject,
): Result<PortalDestination, Error> | undefined {
  const prop = object.properties.get("goto");
  if (!prop) {
    return;
  }
  if (prop.type !== "string") {
    return err(new Error(`'goto' property must be a string`));
  }
  const res = portalDestinationComponentsType(prop.value.split(","));
  if (res instanceof type.errors) {
    return err(
      new Error(`'goto' property invalid: ${res.summary}`, { cause: res }),
    );
  }
  const [areaId, x, y] = res;
  return ok({
    areaId,
    coords: new Vector(x, y),
  });
}

interface Portal {
  readonly destination: PortalDestination;
  readonly object: TiledObject;
}

export interface PortalDestination {
  readonly areaId: AreaId;
  readonly coords: Vector<Tile>;
}

export const dynamicLayerName = "Dynamic";

const stringTileType = type("string").pipe(Number).pipe(TileType);
const portalDestinationComponentsType = type([
  AreaIdType,
  stringTileType,
  stringTileType,
]);
