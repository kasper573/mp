import type {
  GroupLayer,
  ImageLayer,
  Layer,
  LayerDrawOrder,
  ObjectGroupLayer,
  TiledObject,
  TileLayer,
  TileLayerTile,
} from "@mp/tiled-loader";
import { Container } from "pixi.js";
import { createObjectView } from "./object";
import { createTileSprite } from "./tile";
import type { TiledTextureLookup } from "./spritesheet";

export type LayerView = Container;

export class LayerViewFactory {
  constructor(private readonly textureLookup: TiledTextureLookup) {}

  createLayerContainer(layers: Layer[]): LayerView {
    const container = new TileRendererContainer({
      isRenderGroup: true,
      sortableChildren: true,
    });

    // layers are already in the draw order in the tiled data
    for (const [index, layer] of layers.entries()) {
      const view = this.createLayerView(layer);
      memorizeLayer(view, layer);
      view.label = layer.name;
      container.addChildAt(view, index);
    }

    return container;
  }

  private createGroupLayerView(layer: GroupLayer): LayerView {
    return this.createLayerContainer(layer.layers);
  }

  private createTileLayerView(layer: TileLayer): LayerView {
    const container = new TileRendererContainer({
      isRenderGroup: true,
      sortableChildren: true,
    });

    const { groups, isolated } = groupTiles(layer);

    // Some tiles are grouped with the intention of being sorted
    // on the same zIndex. This helps give them the appearance of
    // being a single object, ie. the crown of a tree.
    for (const group of groups) {
      const groupContainer = new Container({ isRenderGroup: true });
      groupContainer.label = `Automatically grouped (groupId: ${group.id})`;

      for (const tile of group.tiles) {
        const sprite = createTileSprite(tile, this.textureLookup);
        groupContainer.addChild(sprite);
      }

      container.addChild(groupContainer);
      groupContainer.zIndex = Math.max(...group.tiles.map((t) => t.y));
    }

    for (const tile of isolated) {
      const sprite = createTileSprite(tile, this.textureLookup);
      sprite.zIndex = tile.y;
      container.addChild(sprite);
    }

    return container;
  }

  private createImageLayerView(layer: ImageLayer): LayerView {
    throw new Error("Not implemented");
  }

  private createObjectGroupLayerView(layer: ObjectGroupLayer): LayerView {
    const view = new TileRendererContainer({
      isRenderGroup: true,
      sortableChildren: true,
    });

    const toSorted = createObjectSorter(layer.draworder);

    for (const obj of toSorted(layer.objects)) {
      view.addChild(createObjectView(obj));
    }

    return view;
  }

  private createLayerView(layer: Layer): LayerView {
    switch (layer.type) {
      case "group":
        return this.createGroupLayerView(layer);
      case "tilelayer":
        return this.createTileLayerView(layer);
      case "imagelayer":
        return this.createImageLayerView(layer);
      case "objectgroup":
        return this.createObjectGroupLayerView(layer);
    }
  }
}

function createObjectSorter(order: LayerDrawOrder): TiledObjectSorter {
  switch (order) {
    case "topdown":
      return (objects) => objects.toSorted((a, b) => a.y - b.y);
    case "index":
      return (objects) => objects;
  }
}

// We use a separate class purely for debug purposes as it provides a name for pixijs devtools
class TileRendererContainer extends Container {}

type TiledObjectSorter = (arr: TiledObject[]) => TiledObject[];

// We store layer instance on a symbol because pixi.js
// containers don't have a way to attach meta data

const layerSymbol = Symbol("layer");

function memorizeLayer(view: Container, layer: Layer) {
  Reflect.set(view, layerSymbol, layer);
}

export function recallLayer(view: Container): Layer {
  return Reflect.get(view, layerSymbol) as Layer;
}

/**
 * Group tiles by their "Group" property and whether they are adjacent to each other.
 */
function groupTiles(layer: TileLayer) {
  const posMap = new Map<string, TileLayerTile>();
  for (const tile of layer.tiles) {
    posMap.set(posKey(tile.x, tile.y), tile);
  }

  const getGroup = (t: TileLayerTile) =>
    t.tile.properties.get("Group")?.value as number | undefined;

  const visited = new Set<TileLayerTile>();
  const groups: Array<{ tiles: TileLayerTile[]; id: number }> = [];

  for (const startTile of layer.tiles) {
    const groupId = getGroup(startTile);
    if (groupId === undefined || visited.has(startTile)) {
      continue;
    }

    const stack = [startTile];
    const group: TileLayerTile[] = [];
    visited.add(startTile);

    while (stack.length > 0) {
      const tile = stack.pop() as TileLayerTile;
      group.push(tile);

      for (const [dx, dy] of cardinalDeltas) {
        const key = posKey(tile.x + dx, tile.y + dy);
        const adjacent = posMap.get(key);
        if (
          adjacent &&
          !visited.has(adjacent) &&
          getGroup(adjacent) === groupId
        ) {
          visited.add(adjacent);
          stack.push(adjacent);
        }
      }
    }

    groups.push({ id: groupId, tiles: group });
  }

  const isolated = layer.tiles.filter((tile) => !visited.has(tile));

  return { groups, isolated };
}

const cardinalDeltas = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function posKey(x: number, y: number) {
  return `${x},${y}`;
}
