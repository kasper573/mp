import path from "node:path";
import fs from "node:fs/promises";
import type {
  ActorModel,
  ActorModelId,
  ActorModelState,
  ActorModleLookup,
} from "@mp/game/server";
import type { LocalFile, PublicUrl, Tile } from "@mp/std";
import { Rect, Vector } from "@mp/math";
import { serverFileToPublicUrl } from "./server-file-to-public-url";

export async function loadActorModels(
  publicDir: string,
): Promise<ActorModleLookup> {
  const modelFolders = await fs.readdir(path.resolve(publicDir, "actors"));
  return new Map(
    await Promise.all(
      modelFolders.map(async (modelFolder) => {
        const modelId = modelFolder as ActorModelId;
        const spritesheetFiles = await fs.readdir(
          path.resolve(publicDir, "actors", modelFolder),
        );
        const spritesheets: ReadonlyMap<ActorModelState, PublicUrl> = new Map(
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
        const model: ActorModel = {
          id: modelId,
          hitBox: Rect.fromDiameter(Vector.zero(), 1 as Tile),
          spritesheets,
        };
        return [modelId, model] as const;
      }),
    ),
  );
}
