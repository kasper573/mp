import {
  ActorId,
  ActorModelId,
  AreaId,
  Character,
  CharacterId,
  ItemDefinition,
  ItemReference,
} from "@mp/game-shared";
import { UrlString, LocalFile, Pixel, Tile, TimesPerSecond } from "@mp/std";
import type { ParsingFunctionsObject } from "apollo-link-scalars";
import { GqlDate } from "./date-scalar";
import { ObjectId } from "@mp/tiled-loader";

export const typesMap: ScalarEncodings = {
  // Primitives
  GqlDate: GqlDate,
  UrlString: primitive(),
  LocalFile: primitive(),
  Pixel: primitive(),
  Tile: primitive(),
  TimesPerSecond: primitive(),
  // Game data
  ActorId: primitive(),
  AreaId: primitive(),
  ActorModelId: primitive(),
  CharacterId: primitive(),
  ObjectId: primitive(),
  ItemReference: passthrough(),
  ItemDefinition: passthrough(),
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

function primitive<T>(): ParsingFunctionsObject<T, unknown> {
  return {
    serialize: assertPrimitive,
    parseValue: assertPrimitive,
  };
}

function assertPrimitive<T>(value: unknown): T {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value as T;
    default:
      throw new Error(`Expected primitive value, got ${typeof value}`);
  }
}

function passthrough<T>(): ParsingFunctionsObject<T, unknown> {
  return {
    serialize: (value) => value,
    parseValue: (value) => value as T,
  };
}
