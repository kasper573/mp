import type { Layer, TileLayerTile } from "./schema/layer";
import type { TiledObject } from "./schema/object";

export function objectsInLayers(
  layers: Layer[],
  transform = noopTransformer,
): TiledObject[] {
  return layers.flatMap((layer) =>
    objectsInLayer(layer, emptyLayerList, transform),
  );
}

export function objectsInLayer(
  layer: Layer,
  ancestry: Layer[],
  transform: TiledObjectTransformer,
): TiledObject[] {
  switch (layer.type) {
    case "group": {
      const newAncestry = ancestry.concat(layer);
      return layer.layers.flatMap((subLayer) =>
        objectsInLayer(subLayer, newAncestry, transform),
      );
    }
    case "objectgroup":
      return layer.objects.map((obj) => transform(obj, ancestry));
    default:
      return [];
  }
}

const noopTransformer: TiledObjectTransformer = (obj) => obj;

export type TiledObjectTransformer = (
  obj: TiledObject,
  ancestry: Layer[],
) => TiledObject;

export function tilesInLayers(layers: Layer[]): TileLayerTile[] {
  return layers.flatMap(tilesInLayer);
}

export function tilesInLayer(layer: Layer): TileLayerTile[] {
  switch (layer.type) {
    case "group":
      return tilesInLayers(layer.layers);
    case "tilelayer":
      return layer.tiles;
    default:
      return emptyTileList;
  }
}

const emptyTileList = Object.freeze([]) as unknown as TileLayerTile[];
const emptyLayerList = Object.freeze([]) as unknown as Layer[];
