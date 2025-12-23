import {
  ActorIdType,
  ActorModelIdType,
  AreaIdType,
  CharacterIdType,
  ItemDefinitionType,
  ItemReferenceType,
  type ActorId,
  type ActorModelId,
  type AreaId,
  type CharacterId,
  type ItemDefinition,
  type ItemReference,
} from "@mp/game-shared";
import {
  type UrlString,
  type LocalFile,
  type Pixel,
  type Tile,
  type TimesPerSecond,
  LocalFileType,
  PixelType,
  TileType,
  TimesPerSecondType,
} from "@mp/std";
import type { ParsingFunctionsObject } from "apollo-link-scalars";
import { GqlDate } from "./date-scalar";
import { ObjectIdType, type ObjectId } from "@mp/tiled-loader";
import { type Type, type } from "@mp/validate";

export const scalars: ScalarEncodings = {
  // Primitives
  GqlDate: GqlDate,
  UrlString: scalarFor(type("string")),
  LocalFile: scalarFor(LocalFileType),
  Pixel: scalarFor(PixelType),
  Tile: scalarFor(TileType),
  TimesPerSecond: scalarFor(TimesPerSecondType),
  // Game data
  ActorId: scalarFor(ActorIdType),
  AreaId: scalarFor(AreaIdType),
  ActorModelId: scalarFor(ActorModelIdType),
  CharacterId: scalarFor(CharacterIdType),
  ObjectId: scalarFor(ObjectIdType),
  ItemReference: scalarFor(ItemReferenceType),
  ItemDefinition: scalarFor(ItemDefinitionType),
};

type ScalarEncodings = {
  [K in keyof Scalars]: ParsingFunctionsObject<Scalars[K], unknown>;
};

export interface Scalars {
  // Primitives
  GqlDate: GqlDate;
  UrlString: UrlString;
  LocalFile: LocalFile;
  Pixel: Pixel;
  Tile: Tile;
  TimesPerSecond: TimesPerSecond;
  // Game data
  AreaId: AreaId;
  ActorId: ActorId;
  ActorModelId: ActorModelId;
  CharacterId: CharacterId;
  ObjectId: ObjectId;
  ItemReference: ItemReference;
  ItemDefinition: ItemDefinition;
}

function scalarFor<Schema extends Type>(
  schema: Schema,
): ParsingFunctionsObject<Schema["inferOut"], unknown> {
  return {
    serialize: (value) => value,
    parseValue: (value) => schema.assert(value),
  };
}
