import type { VectorKey } from "@mp/math";
import { Matrix, Vector } from "@mp/math";
import { Rect } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import { upsertMap } from "@mp/std";
import {
  type TileLayerTile,
  type Property,
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
  #tilesByCoord = new Map<VectorKey, TileLayerTile[]>();

  get obscuringRects(): ReadonlyArray<Rect<Tile>> {
    return this.#obscuringRects;
  }

  constructor(private tiled: TiledResource) {
    for (const layer of this.tiled.map.layers) {
      for (const tile of tileLayerTiles(layer)) {
        upsertMap(this.#tilesByCoord, Vector.key(tile.x, tile.y), tile);
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
      if (obj.gid !== undefined) {
        const tile = tilesetTiles.get(obj.gid);
        if (tile && !isWalkable(tile.properties)) {
          // Use same transform as the renderer to ensure it's correct
          const objTransform = tiledObjectMeshInput(obj).transform;
          this.#obscuringRects.push(
            new Rect(Vector.zero(), Vector.from(obj))
              .apply(objTransform)
              .divide(this.tiled.tileSize) as unknown as Rect<Tile>,
          );
        }
      }
    }
  }

  score(coord: Vector<Tile>): number {
    const tilesAtCoord = this.#tilesByCoord.get(coord.key);
    if (!tilesAtCoord) {
      return 0; // No tiles exist at this coordinate at all
    }

    if (!isWalkable(...tilesAtCoord.map((t) => t.tile.properties))) {
      return 0; // Tiles exist but have been configured to not be walkable
    }

    if (!this.#obscuringRects.length) {
      return 1; // No obscuring objects exist, always fully walkable
    }

    // Tiles exist and are walkable, but may be obscured by objects.
    const rectAtCoord = new Rect(coord, oneTile);
    const tileObscuredAmount = Math.max(
      ...this.#obscuringRects.map((obscure) => rectAtCoord.overlap(obscure)),
    );

    return 1 - tileObscuredAmount;
  }
}

function isWalkable(...propsList: Array<Map<string, Property>>): boolean {
  let walkable = false;
  for (const props of propsList) {
    const val = props.get("Walkable")?.value as boolean | undefined;
    if (val === false) {
      return false;
    }
    if (val === true) {
      walkable = true;
    }
  }
  return walkable;
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
