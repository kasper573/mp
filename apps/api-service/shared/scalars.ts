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

export const typesMap: ScalarEncodings = {
  // Primitives
  GqlDate: GqlDate,
  UrlString: scalarFor<UrlString>(type("string")),
  LocalFile: scalarFor<LocalFile>(LocalFileType),
  Pixel: scalarFor<Pixel>(PixelType),
  Tile: scalarFor<Tile>(TileType),
  TimesPerSecond: scalarFor<TimesPerSecond>(TimesPerSecondType),
  // Game data
  ActorId: scalarFor<ActorId>(ActorIdType),
  AreaId: scalarFor<AreaId>(AreaIdType),
  ActorModelId: scalarFor<ActorModelId>(ActorModelIdType),
  CharacterId: scalarFor<CharacterId>(CharacterIdType),
  ObjectId: scalarFor<ObjectId>(ObjectIdType),
  ItemReference: scalarFor<ItemReference>(ItemReferenceType),
  ItemDefinition: scalarFor<ItemDefinition>(ItemDefinitionType),
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

function scalarFor<T>(schema: Type<T>): ParsingFunctionsObject<T, unknown> {
  return {
    serialize: (value) => value,
    parseValue: (value) => schema.assert(value) as T,
  };
}
