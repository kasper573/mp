import type { ActorModelId } from "@mp/game-shared";
import type { ApiContext } from "../context";
import { ctxDb, ctxFileResolver } from "../context";
import type { UrlString } from "@mp/std";
import { promiseFromResult } from "@mp/std";
import type { FileUrlType } from "../integrations/file-resolver";

/** @gqlQueryField */
export function actorModelIds({ ioc }: ApiContext): Promise<ActorModelId[]> {
  const result = ioc.get(ctxDb).selectAllActorModelIds();
  return promiseFromResult(result);
}

/** @gqlQueryField */
export function actorSpritesheetUrl(
  urlType: FileUrlType,
  { ioc }: ApiContext,
): UrlString {
  const fs = ioc.get(ctxFileResolver);
  return fs.abs(["actors", `actors-0.json`], urlType);
}
