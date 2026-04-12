import type { VectorKey } from "@mp/math";
import { Vector, Rect } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import type { PropertyMap } from "@mp/tiled-loader";
import {
  type TileLayerTile,
  type Layer,
  type GlobalTileId,
  type TilesetTile,
  localToGlobalId,
  tiledObjectTransform,
} from "@mp/tiled-loader";
import type { TiledResource } from "./tiled-resource";

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
        const coordKey = Vector.keyFrom(tile);
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

    for (const obj of this.tiled.objects) {
      const tile = obj.gid !== undefined && tilesetTiles.get(obj.gid);
      if (!tile) {
        continue;
      }

      if (isOneTileWalkable(tile.properties)) {
        continue;
      }

      const objTransform = tiledObjectTransform(obj);
      const rect = new Rect(0 as Pixel, 0 as Pixel, obj.width, obj.height)
        .apply(objTransform)
        .divide(this.tiled.tileSize) as unknown as Rect<Tile>;

      this.#obscuringRects.push(rect);

      const expandedRect = expandToNearestInteger(rect);
      for (let xStep = 0; xStep < expandedRect.width; xStep++) {
        for (let yStep = 0; yStep < expandedRect.height; yStep++) {
          const coord = new Vector(
            (expandedRect.x + xStep) as Tile,
            (expandedRect.y + yStep) as Tile,
          );
          const remove =
            Rect.fromVectors(coord, oneTile).overlap(rect) >=
            this.obscuringCutoff;
          if (remove) {
            this.#walkableCoords.delete(Vector.keyFrom(coord));
          }
        }
      }
    }
  }

  obscureAmount(coord: Vector<Tile>): number {
    if (!this.#obscuringRects.length) {
      return 0;
    }

    const rectAtCoord = Rect.fromVectors(coord, oneTile);
    const tileObscuredAmount = Math.max(
      ...this.#obscuringRects.map((obscure) => rectAtCoord.overlap(obscure)),
    );

    return tileObscuredAmount;
  }
}

function isOneTileWalkable(props: PropertyMap) {
  return props.get("Walkable")?.value as boolean | undefined;
}

function tileLayerTiles(layer: Layer): TileLayerTile[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap(tileLayerTiles);
    case "tilelayer":
      return layer.tiles;
    default:
      return [];
  }
}

const oneTile = new Vector(1 as Tile, 1 as Tile);

function expandToNearestInteger<T extends number>(rect: Rect<T>): Rect<T> {
  const left = Math.floor(rect.x);
  const right = Math.ceil(rect.x + rect.width);
  const top = Math.floor(rect.y);
  const bottom = Math.ceil(rect.y + rect.height);

  return new Rect(
    left as T,
    top as T,
    (right - left) as T,
    (bottom - top) as T,
  );
}
