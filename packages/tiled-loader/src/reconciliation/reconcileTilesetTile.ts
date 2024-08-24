import type { Property } from "../schema/property";
import type { TilesetTile } from "../schema/tileset";

export function reconcileTilesetTile(
  tileset: TilesetTile | UnresolvedTilesetTile,
): void {
  if (Array.isArray(tileset.properties)) {
    const propertyMap = new Map();
    for (const property of tileset.properties) {
      propertyMap.set(property.name, property);
    }
    tileset.properties = propertyMap;
  }
}

type UnresolvedTilesetTile = Omit<TilesetTile, "properties"> & {
  properties: Property[];
};
