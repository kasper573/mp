import type { PublicUrl } from "@mp/std";
import type { ActorModelId, ActorAnimationName } from "../traits/appearance";

export type ActorSpritesheetUrls = ReadonlyMap<
  ActorModelId,
  ReadonlyMap<ActorAnimationName, PublicUrl>
>;
