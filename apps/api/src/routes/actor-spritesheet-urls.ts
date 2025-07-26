import type {
  ActorSpritesheetUrls,
  ActorModelId,
  ActorAnimationName,
} from "@mp/game/server";
import type { PublicUrl } from "@mp/std";
import path from "path";
import { rpc } from "../integrations/trpc";
import type { InjectionContainer } from "@mp/ioc";
import { ctxFileResolver } from "../ioc";

export const actorSpritesheetUrls = rpc.procedure.query(({ ctx }) =>
  getActorSpritesheetUrls(ctx.ioc),
);

export async function getActorSpritesheetUrls(
  ioc: InjectionContainer,
): Promise<ActorSpritesheetUrls> {
  const fs = ioc.get(ctxFileResolver);
  const modelFolders = await fs.dir<ActorModelId>("actors");
  return new Map(
    await Promise.all(
      modelFolders.map(async (modelId) => {
        const spritesheetFiles = await fs.dir("actors", modelId);
        const spritesheets: ReadonlyMap<ActorAnimationName, PublicUrl> =
          new Map(
            await Promise.all(
              spritesheetFiles.map(
                (spritesheet): [ActorAnimationName, PublicUrl] => {
                  const state = path.basename(
                    spritesheet,
                    path.extname(spritesheet),
                  ) as ActorAnimationName;
                  const url = fs.abs("actors", modelId, spritesheet);
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
