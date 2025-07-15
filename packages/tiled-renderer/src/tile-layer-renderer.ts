import { Container } from "@mp/graphics";
import type { TileLayerTile } from "@mp/tiled-loader";
import { createTileRenderer } from "./tile-renderer";
import type { TiledTextureLookup } from "./spritesheet";
import type { VectorKey } from "@mp/math";
import { Vector } from "@mp/math";

/**
 * An extension of the tile-renderer that adds sorting.
 */
export function createTileLayerRenderer(
  tiles: TileLayerTile[],
  textureLookup: TiledTextureLookup,
): Container {
  const container = new Container({
    isRenderGroup: true,
    sortableChildren: true,
  });

  const { groups, other } = groupTiles(tiles);

  const otherContainer = createTileRenderer(other, textureLookup);
  otherContainer.label = "Ungrouped tiles";
  otherContainer.zIndex = 0;
  container.addChild(otherContainer);

  // Some tiles are grouped with the intention of being sorted
  // on the same zIndex. This helps give them the appearance of
  // being a single object, ie. the crown of a tree.
  for (const group of groups) {
    const groupContainer = createTileRenderer(group.tiles, textureLookup);
    groupContainer.label = `Tile group ${group.id}`;
    container.addChild(groupContainer);
    groupContainer.zIndex = Math.max(...group.tiles.map((t) => t.y));
  }

  return container;
}

/**
 * Group tiles by their "Group" property and whether they are adjacent to each other.
 */
function groupTiles(tiles: TileLayerTile[]) {
  const posMap = new Map<VectorKey, TileLayerTile>();
  for (const tile of tiles) {
    posMap.set(Vector.key(tile.x, tile.y), tile);
  }

  const getGroup = (t: TileLayerTile) =>
    t.tile.properties.get("Group")?.value as number | undefined;

  const visited = new Set<TileLayerTile>();
  const groups: Array<{ tiles: TileLayerTile[]; id: number }> = [];

  for (const startTile of tiles) {
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
        const key = Vector.key(tile.x + dx, tile.y + dy);
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

  const other = tiles.filter((tile) => !visited.has(tile));

  return { groups, other };
}

const cardinalDeltas = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
