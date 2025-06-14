import type { Texture } from "pixi.js";
import { Assets } from "pixi.js";
import { createContext } from "solid-js";
import {
  type ActorModelId,
  type ActorAnimationName,
} from "../../server/traits/appearance";
import type { ActorSpritesheetUrls } from "../../server";
import type { ActorSpritesheet } from "./actor-spritesheet";
import { createActorSpritesheet } from "./actor-spritesheet";

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

export const ActorSpritesheetContext = createContext(
  new Proxy(
    {} as ReadonlyMap<
      ActorModelId,
      ReadonlyMap<ActorAnimationName, ActorSpritesheet>
    >,
    {
      get() {
        throw new Error("ActorSpritesheetContext is not initialized");
      },
    },
  ),
);
