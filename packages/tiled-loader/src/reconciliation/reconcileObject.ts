import type { TiledObject } from "../schema/object";
import type { Tileset } from "../schema/tileset";
import { reconcileProperties } from "./reconcileProperties";

export function reconcileObject(
  obj: TiledObject | ObjectTemplate,
): TiledObject {
  if ("object" in obj) {
    throw new Error("Object template reconciliation not implemented");
  }

  reconcileProperties(obj);

  if ("ellipse" in obj) return { ...obj, objectType: "ellipse" } as never;
  if ("point" in obj) return { ...obj, objectType: "point" } as never;
  if ("polygon" in obj) return { ...obj, objectType: "polygon" };
  if ("polyline" in obj) return { ...obj, objectType: "polyline" };
  if ("text" in obj) return { ...obj, objectType: "text" };

  return { ...obj, objectType: "rectangle" };
}

interface ObjectTemplate {
  template: string;
  tileset?: Tileset;
  object: TiledObject;
}
