import type { Texture } from "pixi.js";
import { Assets } from "pixi.js";
import { InjectionContext } from "@mp/ioc";
import type { ParentProps } from "solid-js";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import {
  type ActorModelId,
  type ActorAnimationName,
} from "../../server/traits/appearance";
import type { ActorSpritesheetUrls } from "../../server";
import { ioc } from "../context";
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

export const ctxActorSpritesheetLookup =
  InjectionContext.new<ActorSpritesheetLookup>("ActorSpritesheetLookup");

/**
 * Remove this once spritesheets can be loaded with suspense and can be registered easier inline without an effect.
 * @deprecated
 */
export function ActorSpritesheetContextProvider(
  props: ParentProps<{
    value: ActorSpritesheetLookup;
  }>,
) {
  const [didRegister, setDidRegister] = createSignal(false);

  createEffect(() => {
    onCleanup(ioc.register(ctxActorSpritesheetLookup, props.value));
    setDidRegister(true);
  });

  return <Show when={didRegister()}>{props.children}</Show>;
}
