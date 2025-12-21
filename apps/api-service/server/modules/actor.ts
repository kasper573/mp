import { ActorModelId } from "@mp/game-shared";
import { ApiContext, ctxDb, ctxFileResolver } from "../context";
import { promiseFromResult, UrlString } from "@mp/std";
import { FileUrlType } from "../integrations/file-resolver";

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
