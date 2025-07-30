import type { ActorModelId } from "@mp/db/types";
import type { Texture } from "@mp/graphics";
import { Assets } from "@mp/graphics";
import { InjectionContext } from "@mp/ioc";
import type { ActorSpritesheet } from "./actor-spritesheet";
import { createActorSpritesheet } from "./actor-spritesheet";
import type { ActorSpritesheetUrls } from "./actor-spritesheet-urls";
import type { ActorAnimationName } from "./appearance";

export type ActorSpritesheetLookup = ReadonlyMap<
  ActorModelId,
  ReadonlyMap<ActorAnimationName, ActorSpritesheet>
>;

export async function loadActorSpritesheets(
  urls: ActorSpritesheetUrls,
): Promise<ActorSpritesheetLookup> {
  return new Map(
    await Promise.all(
      urls.entries().map(async ([modelId, states]) => {
        return [
          modelId,
          new Map(
            await Promise.all(
              Array.from(states.entries()).map(async ([state, ssUrl]) => {
                const texture = await Assets.load<Texture>(ssUrl);
                texture.source.scaleMode = "nearest";
                const ss = createActorSpritesheet(texture, {
                  // TODO should come as metadata from the spritesheet
                  width: 48,
                  height: 64,
                });
                await ss.parse();
                return [state, ss] as const;
              }),
            ),
          ),
        ] as const;
      }),
    ),
  );
}

export const ctxActorSpritesheetLookup =
  InjectionContext.new<ActorSpritesheetLookup>("ActorSpritesheetLookup");
