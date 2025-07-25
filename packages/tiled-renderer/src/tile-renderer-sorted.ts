import { Container } from "@mp/graphics";
import type { TileLayerTile } from "@mp/tiled-loader";
import { renderLayerTiles } from "./tile-renderer";
import type { TiledTextureLookup } from "./spritesheet";
import type { VectorKey } from "@mp/math";
import { Vector } from "@mp/math";

/**
 * An extension of the tile-renderer that detects groups of tiles and sorts them by their shared y position
 */
export function renderLayerTilesSorted(
  tiles: TileLayerTile[],
  textureLookup: TiledTextureLookup,
): Container {
  const container = new Container({ isRenderGroup: true });

  const { groups, other } = groupTiles(tiles);

  const otherContainer = new Container({ isRenderGroup: true });
  otherContainer.label = "Ungrouped tiles";
  otherContainer.zIndex = 0;
  for (const mesh of renderLayerTiles(other, textureLookup)) {
    otherContainer.addChild(mesh);
  }
  container.addChild(otherContainer);

  // Some tiles are grouped with the intention of being sorted
  // on the same zIndex. This helps give them the appearance of
  // being a single object, ie. the crown of a tree.
  for (const group of groups) {
    const groupContainer = new Container({ isRenderGroup: true });
    groupContainer.label = `Tile group ${group.id}`;
    for (const mesh of renderLayerTiles(group.tiles, textureLookup)) {
      groupContainer.addChild(mesh);
    }
    groupContainer.zIndex = group.tiles.reduce(
      (zIndex, tile) => Math.max(zIndex, tile.y * tile.height),
      groupContainer.zIndex,
    );
    container.addChild(groupContainer);
  }

  return container;
}

/**
 * Group tiles by their "Group" property and whether they are adjacent to each other.
 */
function groupTiles(tiles: TileLayerTile[]) {
  const tilesWithGroup = tiles.filter(getGroup);
  const posMap = new Map<VectorKey, TileLayerTile>();
  for (const tile of tilesWithGroup) {
    posMap.set(Vector.keyFrom(tile), tile);
  }

  const visited = new Set<TileLayerTile>();
  const groups: Array<{ tiles: TileLayerTile[]; id: number }> = [];

  for (const startTile of tilesWithGroup) {
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

function getGroup(t: TileLayerTile) {
  return t.tile.properties.get("Group")?.value as number | undefined;
}

const cardinalDeltas = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
