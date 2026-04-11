import type { ActorModelId } from "@mp/world";
import { actorModelIds as staticActorModelIds } from "@mp/world";
import type { ApiContext } from "../context";
import { ctxFileResolver } from "../context";
import type { UrlString } from "@mp/std";
import type { FileUrlType } from "../integrations/file-resolver";

/** @gqlQueryField */
export function actorModelIds(): readonly ActorModelId[] {
  return staticActorModelIds;
}

/** @gqlQueryField */
export function actorSpritesheetUrl(
  urlType: FileUrlType,
  { ioc }: ApiContext,
): UrlString {
  const fs = ioc.get(ctxFileResolver);
  return fs.abs(["actors", `actors-0.json`], urlType);
}
