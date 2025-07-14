import path from "node:path";
import fs from "node:fs/promises";
import type {
  ActorModel,
  ActorModelId,
  ActorAnimationName,
  ActorModelLookup,
} from "@mp/game/server";
import type { LocalFile, PublicUrl, Tile } from "@mp/std";
import { Rect } from "@mp/math";
import { serverFileToPublicUrl } from "./server-file-to-public-url";

export async function loadActorModels(
  publicDir: string,
): Promise<ActorModelLookup> {
  const modelFolders = await fs.readdir(path.resolve(publicDir, "actors"));
  return new Map(
    await Promise.all(
      modelFolders.map(async (modelFolder) => {
        const modelId = modelFolder as ActorModelId;
        const spritesheetFiles = await fs.readdir(
          path.resolve(publicDir, "actors", modelFolder),
        );
        const spritesheets: ReadonlyMap<ActorAnimationName, PublicUrl> =
          new Map(
            await Promise.all(
              spritesheetFiles.map(
                (spritesheet): [ActorAnimationName, PublicUrl] => {
                  const state = path.basename(
                    spritesheet,
                    path.extname(spritesheet),
                  ) as ActorAnimationName;
                  const url = serverFileToPublicUrl(
                    path.join("actors", modelFolder, spritesheet) as LocalFile,
                  );
                  return [state, url];
                },
              ),
            ),
          );
        const model: ActorModel = {
          id: modelId,
          spritesheets,
          // TODO should be read from some meta data on file
          // These values are based on the adventurer model
          hitBox: Rect.fromComponents(-0.5, -1.5, 1, 2) as Rect<Tile>,
        };
        return [modelId, model] as const;
      }),
    ),
  );
}
