import type { TiledObject } from "../schema/object";

export function reconcileObject(obj: TiledObject): TiledObject {
  if ("ellipse" in obj) return { ...obj, objectType: "ellipse" } as never;
  if ("point" in obj) return { ...obj, objectType: "point" } as never;
  if ("polygon" in obj) return { ...obj, objectType: "polygon" };
  if ("polyline" in obj) return { ...obj, objectType: "polyline" };
  if ("text" in obj) return { ...obj, objectType: "text" };
  if ("object" in obj) {
    return {
      ...obj,
      objectType: "template",
      object: reconcileObject(obj.object),
    };
  }
  return { ...obj, objectType: "rectangle" };
}
