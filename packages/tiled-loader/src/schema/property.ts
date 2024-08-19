import {
  boolean,
  variant,
  float,
  integer,
  literal,
  object,
  string,
  optional,
} from "@mp/schema";
import type { LoaderContext } from "../context";
import type { Color, File, ObjectId, TiledClass } from "./common";
import { color, file, objectId, tiledClass } from "./common";

interface SpecificProperty<Type extends string, Value> {
  /**
   * Name of the property
   */
  name: string;
  /**
   * Name of the custom property type, when applicable
   */
  propertytype?: string;
  type: Type;
  value: Value;
}

export type Property =
  | SpecificProperty<"string", string>
  | SpecificProperty<"int", number>
  | SpecificProperty<"float", number>
  | SpecificProperty<"bool", boolean>
  | SpecificProperty<"color", Color>
  | SpecificProperty<"file", File>
  | SpecificProperty<"object", ObjectId>
  | SpecificProperty<"class", TiledClass>;

const sharedProps = {
  /**
   * Name of the property
   */
  name: string,
  /**
   * Name of the custom property type, when applicable
   */
  propertytype: optional(string),
};

export function property(context: LoaderContext) {
  return variant("type", [
    object({ ...sharedProps, type: literal("string"), value: string }),
    object({ ...sharedProps, type: literal("int"), value: integer }),
    object({ ...sharedProps, type: literal("float"), value: float }),
    object({ ...sharedProps, type: literal("bool"), value: boolean }),
    object({ ...sharedProps, type: literal("color"), value: color }),
    object({ ...sharedProps, type: literal("file"), value: file(context) }),
    object({ ...sharedProps, type: literal("object"), value: objectId }),
    object({ ...sharedProps, type: literal("class"), value: tiledClass }),
  ]);
}
