import type { ActorModelId } from "@mp/db/types";
import type { UrlString } from "@mp/std";
import type { ActorAnimationName } from "./appearance";

export type ActorSpritesheetUrls = ReadonlyMap<
  ActorModelId,
  ReadonlyMap<ActorAnimationName, UrlString>
>;
