import type { Texture } from "pixi.js";
import { Assets, type Spritesheet } from "pixi.js";
import type { ParentProps } from "solid-js";
import { Show } from "solid-js";
import {
  type ActorModelId,
  type ActorModelState,
} from "../../server/traits/appearance";
import { useRpc } from "../use-rpc";
import type { ActorSpritesheetUrls } from "../../server";
import { ActorSpritesheetContext } from "./actor-sprite";
import { createCharacterSpritesheet } from "./actor-spritesheet";

export async function loadActorSpritesheets(
  urls: ActorSpritesheetUrls,
): Promise<
  ReadonlyMap<ActorModelId, ReadonlyMap<ActorModelState, Spritesheet>>
> {
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
                const ss = createCharacterSpritesheet(texture, {
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

export function ActorSpritesheetProvider(props: ParentProps) {
  const rpc = useRpc();
  const spritesheets = rpc.area.actorSpritesheetUrls.useQuery(() => ({
    input: void 0,
    map: loadActorSpritesheets,
  }));
  return (
    <Show when={spritesheets.data} keyed>
      {(loadedSpritesheets) => (
        <ActorSpritesheetContext.Provider value={loadedSpritesheets}>
          {props.children}
        </ActorSpritesheetContext.Provider>
      )}
    </Show>
  );
}
