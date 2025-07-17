import type { VectorKey } from "@mp/math";
import { Vector } from "@mp/math";
import { Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import type { PropertyMap } from "@mp/tiled-loader";
import {
  type TileLayerTile,
  type Layer,
  type GlobalTileId,
  type TilesetTile,
  localToGlobalId,
} from "@mp/tiled-loader";
import type { TiledResource } from "./tiled-resource";
import { tiledObjectMeshInput } from "@mp/tiled-renderer";

/**
 * Checks for the "Walkable" property in the tiled data and determines a score
 * for a given tile coordinate that indicates how walkable it is.
 *
 * 0 means not walkable at all, 1 means fully walkable.
 * anywhere in between means it's obscured by one or several objects,
 * and the value represents the percentage of the tile that is obscured.
 */
export class WalkableChecker {
  #obscuringRects: Rect<Tile>[] = [];
  #nonWalkableCoords = new Set<VectorKey>();
  #walkableCoords = new Map<VectorKey, Vector<Tile>>();
  readonly obscuringCutoff = 0.4;

  get obscuringRects(): ReadonlyArray<Rect<Tile>> {
    return this.#obscuringRects;
  }

  get walkableCoords(): ReadonlyMap<VectorKey, Vector<Tile>> {
    return this.#walkableCoords;
  }

  constructor(private tiled: TiledResource) {
    for (const layer of this.tiled.map.layers) {
      for (const tile of tileLayerTiles(layer)) {
        const coordKey = Vector.key(tile.x, tile.y);
        if (this.#nonWalkableCoords.has(coordKey)) {
          continue;
        }

        const walkable = isOneTileWalkable(tile.tile.properties);
        if (walkable === false) {
          this.#nonWalkableCoords.add(coordKey);
          this.#walkableCoords.delete(coordKey);
          continue;
        }

        if (walkable === true) {
          this.#walkableCoords.set(coordKey, new Vector(tile.x, tile.y));
        }
      }
    }

    const tilesetTiles = new Map<GlobalTileId, TilesetTile>();
    for (const tileset of this.tiled.map.tilesets) {
      for (const tile of tileset.tiles.values()) {
        tilesetTiles.set(localToGlobalId(tileset.firstgid, tile.id), tile);
      }
    }

    /**
     * The gid in objects refer to tiles that are actually rendered,
     * and some of those rendered tiles may not be considered walkable,
     * in which case that means the object is "obscuring" a portion of the map.
     * This function yields the rectangles that represent the obscured areas.
     */
    for (const obj of this.tiled.objects()) {
      // Object is not representing a tile at all
      const tile = obj.gid !== undefined && tilesetTiles.get(obj.gid);
      if (!tile) {
        continue;
      }

      // Object represents a walkable tile, so it is not considered obscuring
      if (isOneTileWalkable(tile.properties)) {
        continue;
      }

      // Object may be obscuring some walkable tiles.
      // We need to figure out which walkable coords to remove.

      // Use same transform as the renderer to ensure it's correct
      const objTransform = tiledObjectMeshInput(obj).transform;
      const rect = new Rect(Vector.zero(), new Vector(obj.width, obj.height))
        .apply(objTransform)
        .divide(this.tiled.tileSize) as unknown as Rect<Tile>;

      // Remember the obscuring rect for debugging

      // Look at the nearest tiles around the obscuring rect
      const expanded = expandToNearestInteger(rect);
      this.#obscuringRects.push(expanded);

      for (const coord of tileCoordsInRect(expanded)) {
        const remove =
          new Rect(coord, oneTile).overlap(rect) >= this.obscuringCutoff;
        if (remove) {
          this.#walkableCoords.delete(coord.key);
        }
      }
    }
  }

  obscureAmount(coord: Vector<Tile>): number {
    if (!this.#obscuringRects.length) {
      return 0; // No obscuring rects exist to obscure anything
    }

    const rectAtCoord = new Rect(coord, oneTile);
    const tileObscuredAmount = Math.max(
      ...this.#obscuringRects.map((obscure) => rectAtCoord.overlap(obscure)),
    );

    return tileObscuredAmount;
  }
}

function isOneTileWalkable(props: PropertyMap) {
  return props.get("Walkable")?.value as boolean | undefined;
}

function* tileLayerTiles(layer: Layer): Generator<TileLayerTile> {
  switch (layer.type) {
    case "group":
      for (const subLayer of layer.layers) {
        yield* tileLayerTiles(subLayer);
      }
      break;
    case "tilelayer":
      for (const tile of layer.tiles) {
        yield tile;
      }
      break;
  }
}

const oneTile = new Vector(1 as Tile, 1 as Tile);

function* tileCoordsInRect<T extends number>(
  rect: Rect<T>,
): Generator<Vector<T>> {
  for (let xStep = 0; xStep < rect.width; xStep++) {
    for (let yStep = 0; yStep < rect.height; yStep++) {
      const x = rect.x + xStep;
      const y = rect.y + yStep;
      yield new Vector(x as T, y as T);
    }
  }
}

function expandToNearestInteger<T extends number>(rect: Rect<T>): Rect<T> {
  const left = Math.floor(rect.x);
  const right = Math.ceil(rect.x + rect.width);
  const top = Math.floor(rect.y);
  const bottom = Math.ceil(rect.y + rect.height);

  return new Rect(
    new Vector(left as T, top as T),
    new Vector((right - left) as T, (bottom - top) as T),
  );
}
