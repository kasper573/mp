import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import type {
  VectorTiledMap,
  TileLayerTile,
  Layer,
  TileLayer,
  VectorTiledObjectUnion,
  TiledObject,
  TiledClass,
} from "@mp/tiled-loader";
import { createPosition, createSize } from "@mp/tiled-loader";

/**
 * Transform a legacy TiledObject to a Vector-based object
 */
function transformToVectorObject(obj: TiledObject): VectorTiledObjectUnion {
  const position = createPosition(obj.x, obj.y);
  const size = createSize(obj.width, obj.height);
  
  const baseProps = {
    id: obj.id as any,
    name: obj.name,
    position,
    size,
    rotation: obj.rotation as any,
    type: obj.type,
    visible: obj.visible,
    properties: obj.properties,
    gid: obj.gid as any,
  };

  switch (obj.objectType) {
    case "ellipse":
      return { ...baseProps, objectType: "ellipse" };
    case "point":
      return { ...baseProps, objectType: "point" };
    case "polygon":
      return { 
        ...baseProps, 
        objectType: "polygon",
        polygon: obj.polygon.map(coord => createPosition(coord.x, coord.y))
      };
    case "polyline":
      return { 
        ...baseProps, 
        objectType: "polyline",
        polyline: obj.polyline.map(coord => createPosition(coord.x, coord.y))
      };
    case "rectangle":
      return { ...baseProps, objectType: "rectangle" };
    case "text":
      return { ...baseProps, objectType: "text", text: obj.text };
    default: {
      // Check if it has a gid (tile object)
      const objWithGid = obj as Record<string, unknown>;
      if (objWithGid.gid) {
        return { ...baseProps, objectType: "tile", gid: objWithGid.gid as any };
      }
      // Default to rectangle for unknown types
      return { ...baseProps, objectType: "rectangle" };
    }
  }
}

export class TiledResource {
  constructor(public readonly map: VectorTiledMap) {}

  get tileSize() {
    return this.map.tileSize;
  }

  get mapSize(): Vector<Pixel> {
    return this.tileCount.scale(this.tileSize);
  }

  get tileCount(): Vector<Tile> {
    return this.map.mapSize;
  }

  worldCoordToTile = ({ x, y }: Vector<Pixel>): Vector<Tile> => {
    return new Vector(
      (x / this.map.tileSize.x - 0.5) as Tile,
      (y / this.map.tileSize.y - 0.5) as Tile,
    );
  };

  tileCoordToWorld = ({ x, y }: Vector<Tile>): Vector<Pixel> => {
    return new Vector(
      ((x + 0.5) * this.map.tileSize.x) as Pixel,
      ((y + 0.5) * this.map.tileSize.y) as Pixel,
    );
  };

  tileToWorldUnit = (n: Tile): Pixel => (n * this.map.tileSize.x) as Pixel;

  getMatchingTileCoords = <T>(
    getValue: (tile: TileLayerTile) => T,
    coordinateTest: (values: NoInfer<T>[]) => boolean,
  ): Vector<Tile>[] => {
    const tilesPerCoordinate = groupBy(
      this.map.layers
        .flatMap((layer) => filterTileLayerTiles(layer, all))
        .map((layerTile) => ({
          pos: new Vector(layerTile.x, layerTile.y),
          propertyValue: getValue(layerTile),
        })),
      ({ pos: { x, y } }) => `${String(x)}|${String(y)}`,
    );

    const coordinates: Vector<Tile>[] = [];
    for (const tiles of tilesPerCoordinate.values()) {
      const values = tiles.map((t) => t.propertyValue);
      if (coordinateTest(values)) {
        coordinates.push(tiles[0].pos);
      }
    }

    return coordinates;
  };

  getTilesByProperty = (propertyFilter: string): TileLayerTile[] => {
    const predicate = (lt: TileLayerTile) =>
      lt.tile.properties.has(propertyFilter);
    return this.map.layers.flatMap((layer) =>
      filterTileLayerTiles(layer, predicate),
    );
  };

  getObjectsByClassName = (className: TiledClass): TiledObject[] => {
    const predicate = (obj: TiledObject) => obj.type === className;
    return this.map.layers.flatMap((layer) =>
      filterTiledObjects(layer, predicate),
    );
  };

  getTileLayers = (name: string): TileLayer[] => {
    const predicate = (layer: TileLayer) => layer.name === name;
    return this.map.layers.flatMap((layer) =>
      filterTileLayers(layer, predicate),
    );
  };

  getObjects = (): Iterable<VectorTiledObjectUnion> =>
    this.map.layers.flatMap((layer) => filterTiledObjects(layer, all)) as any;
}

function groupBy<T, K>(array: Iterable<T>, key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of array) {
    const k = key(item);
    let items = map.get(k);
    if (!items) {
      items = [];
      map.set(k, items);
    }
    items.push(item);
  }
  return map;
}

function filterTileLayers(
  layer: Layer,
  filter: (layer: TileLayer) => boolean,
): TileLayer[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap((child) => filterTileLayers(child, filter));
    case "tilelayer":
      return filter(layer) ? [layer] : [];
    case "imagelayer":
      return [];
    case "objectgroup":
      return [];
  }
}

function filterTileLayerTiles(
  layer: Layer,
  filter: (tile: TileLayerTile) => boolean,
): TileLayerTile[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap((child) =>
        filterTileLayerTiles(child, filter),
      );
    case "tilelayer":
      return layer.tiles.filter(filter);
    case "imagelayer":
      return [];
    case "objectgroup":
      return [];
  }
}

function filterTiledObjects(
  layer: Layer,
  filter: (obj: TiledObject) => boolean,
): TiledObject[] {
  switch (layer.type) {
    case "group":
      return layer.layers.flatMap((child) => filterTiledObjects(child, filter));
    case "tilelayer":
      return [];
    case "imagelayer":
      return [];
    case "objectgroup":
      // Transform old objects to new Vector-based objects
      return layer.objects
        .map((obj: unknown) => {
          // If it's already a Vector object, return as-is
          const objectCandidate = obj as Record<string, unknown>;
          if (objectCandidate.position && objectCandidate.size) {
            return obj as VectorTiledObjectUnion;
          }
          // Otherwise, transform it
          return transformToVectorObject(obj as TiledObject);
        })
        .filter(filter as any) as any;
  }
}

const all = () => true;
