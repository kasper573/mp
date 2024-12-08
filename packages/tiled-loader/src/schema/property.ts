import type { Color, ObjectId, TiledClass } from "./common.ts";

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
  // Disabling this until we need property files since filepaths need reconciling
  // and properties are used so often, and it's a bit of a pain to reconcile them all
  // and then not even use property files
  //| SpecificProperty<"file", FilePath>
  | SpecificProperty<"object", ObjectId>
  | SpecificProperty<"class", TiledClass>;

export type PropertyMap = Map<string, Property>;
