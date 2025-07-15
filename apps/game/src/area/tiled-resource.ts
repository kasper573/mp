import { Rect, Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import type { Property } from "@mp/tiled-loader";
import {
  type TiledMap,
  type TileLayerTile,
  type Layer,
  type TiledObject,
  type TilesetTile,
  type GlobalTileId,
  localToGlobalId,
} from "@mp/tiled-loader";

export class TiledResource {
  #tilesetTiles = new Map<GlobalTileId, TilesetTile>();
  #layerTiles: TileLayerTile[] = [];
  #objects = new Map<TiledObject["id"], TiledObject>();

  get tilesetTiles(): ReadonlyMap<GlobalTileId, TilesetTile> {
    return this.#tilesetTiles;
  }

  get layerTiles(): ReadonlyArray<TileLayerTile> {
    return this.#layerTiles;
  }

  get objects(): ReadonlyMap<TiledObject["id"], TiledObject> {
    return this.#objects;
  }

  constructor(public readonly map: TiledMap) {
    for (const tileset of this.map.tilesets) {
      for (const tile of tileset.tiles.values()) {
        this.#tilesetTiles.set(
          localToGlobalId(tileset.firstgid, tile.id),
          tile,
        );
      }
    }

    for (const layer of this.map.layers) {
      for (const obj of objectsInLayer(layer)) {
        this.#objects.set(obj.id, obj);
      }

      for (const tile of tileLayerTiles(layer)) {
        this.#layerTiles.push(tile);
      }
    }
  }

  get tileSize() {
    return new Vector(this.map.tilewidth, this.map.tileheight);
  }

  get mapSize(): Vector<Pixel> {
    return this.tileCount.scale(this.tileSize);
  }

  get tileCount(): Vector<Tile> {
    return new Vector(this.map.width, this.map.height);
  }

  worldCoordToTile = ({ x, y }: Vector<Pixel>): Vector<Tile> => {
    return new Vector(
      (x / this.map.tilewidth - 0.5) as Tile,
      (y / this.map.tileheight - 0.5) as Tile,
    );
  };

  tileCoordToWorld = ({ x, y }: Vector<Tile>): Vector<Pixel> => {
    return new Vector(
      ((x + 0.5) * this.map.tilewidth) as Pixel,
      ((y + 0.5) * this.map.tileheight) as Pixel,
    );
  };

  tileToWorldUnit = (n: Tile): Pixel => (n * this.map.tilewidth) as Pixel;

  /**
   * The gid in objects refer to tiles that are actually rendered,
   * and some of those rendered tiles may not be considered walkable,
   * in which case that means the object is "obscuring" a portion of the map.
   * This function yields the rectangles that represent the obscured areas.
   */
  *obscuringRects(): Generator<Rect<Tile>> {
    for (const obj of this.objects.values()) {
      if (obj.gid !== undefined) {
        const tile = this.tilesetTiles.get(obj.gid);
        if (tile && !TiledResource.isTileWalkable(tile.properties)) {
          const rect = Rect.from(obj).divide(
            this.tileSize,
          ) as unknown as Rect<Tile>;
          yield rect;
        }
      }
    }
  }

  static isTileWalkable(...propsList: Array<Map<string, Property>>): boolean {
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

function* objectsInLayer(layer: Layer): Generator<TiledObject> {
  switch (layer.type) {
    case "group":
      for (const subLayer of layer.layers) {
        yield* objectsInLayer(subLayer);
      }
      break;
    case "objectgroup":
      for (const obj of layer.objects) {
        yield obj;
      }
      break;
  }
}
