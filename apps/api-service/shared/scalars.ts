import type {
  AreaId,
  ActorId,
  ActorModelId,
  CharacterId,
  ItemReference,
  ItemDefinition,
} from "@mp/game-shared";
import type { LocalFile, Pixel, Tile, TimesPerSecond } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { ParsingFunctionsObject } from "apollo-link-scalars";
import { GqlDate } from "./date-scalar";

export const scalars = {
  // Primitives
  GqlDate: GqlDate,
  UrlString: scalarFor<string>(),
  LocalFile: scalarFor<LocalFile>(),
  Pixel: scalarFor<Pixel>(),
  Tile: scalarFor<Tile>(),
  TimesPerSecond: scalarFor<TimesPerSecond>(),
  // Game data
  ActorId: scalarFor<ActorId>(),
  AreaId: scalarFor<AreaId>(),
  ActorModelId: scalarFor<ActorModelId>(),
  CharacterId: scalarFor<CharacterId>(),
  ObjectId: scalarFor<ObjectId>(),
  ItemReference: scalarFor<ItemReference>(),
  ItemDefinition: scalarFor<ItemDefinition>(),
} satisfies Record<string, ParsingFunctionsObject<unknown, unknown>>;

export type Scalars = {
  [K in keyof typeof scalars]: ReturnType<(typeof scalars)[K]["parseValue"]>;
};

// We blind trust the scalar types instead of using @mp/validate schemas at runtime,
// since @mp/validate adds ~100kb to the client bundle size.
// Malicious scalar input is a calculated risk we're willing to take.
// Code paths using the scalars shouldn't be using the scalars in a way that would compromise security,
// and request size limits will be bounded by the http server already before graphql comes into the picture.
function scalarFor<Type>(): ParsingFunctionsObject<Type, unknown> {
  return {
    serialize: (value) => value,
    parseValue: (value) => value as Type,
  };
}
