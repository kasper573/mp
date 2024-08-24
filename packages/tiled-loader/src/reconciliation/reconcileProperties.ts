import type { Property, PropertyMap } from "../schema/property";

export function reconcileProperties(target: {
  properties: Property[] | PropertyMap;
}): void {
  if (Array.isArray(target.properties)) {
    const propertyMap: PropertyMap = new Map();
    for (const property of target.properties) {
      propertyMap.set(property.name, property);
    }
    target.properties = propertyMap;
  }
}
