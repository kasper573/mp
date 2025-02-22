import type { Property, PropertyMap } from "../schema/property.ts";

export function reconcileProperties(target: {
  properties: Property[] | PropertyMap;
}): void {
  if (target.properties instanceof Map) {
    return;
  }

  const propertyMap: PropertyMap = new Map();

  if (Array.isArray(target.properties)) {
    for (const property of target.properties) {
      propertyMap.set(property.name, property);
    }
  }

  target.properties = propertyMap;
}
