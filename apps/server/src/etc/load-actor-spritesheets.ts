import path from "node:path";
import fs from "node:fs/promises";
import type {
  ActorModelId,
  ActorModelState,
  ActorSpritesheetUrls,
} from "@mp/game/server";
import type { LocalFile, PublicUrl } from "@mp/std";
import { serverFileToPublicUrl } from "./server-file-to-public-url";

export async function loadActorSpritesheets(
  publicDir: string,
): Promise<ActorSpritesheetUrls> {
  const modelFolders = await fs.readdir(path.resolve(publicDir, "actors"));
  return new Map(
    await Promise.all(
      modelFolders.map(async (modelFolder) => {
        const modelId = modelFolder as ActorModelId;
        const spritesheetFiles = await fs.readdir(
          path.resolve(publicDir, "actors", modelFolder),
        );
        const urls: ReadonlyMap<ActorModelState, PublicUrl> = new Map(
          await Promise.all(
            spritesheetFiles.map(
              (spritesheet): [ActorModelState, PublicUrl] => {
                const state = path.basename(
                  spritesheet,
                  path.extname(spritesheet),
                ) as ActorModelState;
                const url = serverFileToPublicUrl(
                  path.join("actors", modelFolder, spritesheet) as LocalFile,
                );
                return [state, url];
              },
            ),
          ),
        );
        return [modelId, urls] as const;
      }),
    ),
  );
}
