import type { TypeOf } from "@mp/schema";
import {
  boolean,
  variant,
  float,
  integer,
  literal,
  object,
  optional,
  string,
} from "@mp/schema";
import { color, file, objectId, tiledClass } from "./common";

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

export type Property = TypeOf<typeof property>;
export const property = variant("type", [
  object({ ...sharedProps, type: literal("string"), value: string }),
  object({ ...sharedProps, type: literal("int"), value: integer }),
  object({ ...sharedProps, type: literal("float"), value: float }),
  object({ ...sharedProps, type: literal("bool"), value: boolean }),
  object({ ...sharedProps, type: literal("color"), value: color }),
  object({ ...sharedProps, type: literal("file"), value: file }),
  object({ ...sharedProps, type: literal("object"), value: objectId }),
  object({ ...sharedProps, type: literal("class"), value: tiledClass }),
]);
