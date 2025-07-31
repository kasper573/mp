import type { ActorModelId } from "@mp/db/types";
import type { ActorAnimationName, ActorSpritesheetUrls } from "@mp/game-shared";
import type { InjectionContainer } from "@mp/ioc";
import type { UrlString } from "@mp/std";
import path from "path";
import { ctxFileResolver } from "../context";
import { FileUrlType } from "../integrations/file-resolver";
import { rpc } from "../integrations/trpc";

export const actorSpritesheetUrls = rpc.procedure
  .input(FileUrlType)
  .query(({ ctx, input }) => getActorSpritesheetUrls(ctx.ioc, input));

export async function getActorSpritesheetUrls(
  ioc: InjectionContainer,
  urlType: FileUrlType,
): Promise<ActorSpritesheetUrls> {
  const fs = ioc.get(ctxFileResolver);
  const modelFolders = await fs.dir<ActorModelId>(["actors"]);
  return new Map(
    await Promise.all(
      modelFolders.map(async (modelId) => {
        const spritesheetFiles = await fs.dir(["actors", modelId]);
        const spritesheets: ReadonlyMap<ActorAnimationName, UrlString> =
          new Map(
            await Promise.all(
              spritesheetFiles.map(
                (spritesheet): [ActorAnimationName, UrlString] => {
                  const state = path.basename(
                    spritesheet,
                    path.extname(spritesheet),
                  ) as ActorAnimationName;
                  const url = fs.abs(["actors", modelId, spritesheet], urlType);
                  return [state, url];
                },
              ),
            ),
          );
        return [modelId, spritesheets] as const;
      }),
    ),
  );
}
