import type { Texture } from "pixi.js";
import { Assets, type Spritesheet } from "pixi.js";
import type { ParentProps } from "solid-js";
import { createResource, Show } from "solid-js";
import type { ActorModelId } from "../../server/traits/appearance";
import { createCharacterSpritesheet } from "./actor-spritesheet";
import { ActorSpritesheetContext } from "./actor-sprite";

export type ActorSpriteState = (typeof actorSpriteStates)[number];

export const actorSpriteStates = Object.freeze([
  "attack-shooting",
  "attack-spear",
  "dash-dust",
  "dash-gun",
  "dash-normal",
  "dash-shadow",
  "dash-spear",
  "death-gun",
  "death-normal",
  "death-shadow-gun",
  "death-shadow-normal",
  "death-shadow-spear",
  "death-spear",
  "idle-gun",
  "idle-normal",
  "idle-spear",
  "jump-dust",
  "jump-gun",
  "jump-normal",
  "jump-shadow",
  "jump-spear",
  "reloading",
  "run-gun",
  "run-normal",
  "run-shooting",
  "run-spear",
  "shadow",
  "walk-aiming",
  "walk-gun",
  "walk-normal",
  "walk-reloading",
  "walk-shooting",
  "walk-spear",
] as const);

export async function loadActorSpritesheetForState(
  modelId: ActorModelId,
  state: ActorSpriteState,
): Promise<Spritesheet> {
  const { default: spritesheetUrl } = (await import(
    `../../../server/public/actors/${modelId}/${state}.png`
  )) as { default: string };
  const texture = await Assets.load<Texture>(spritesheetUrl);
  texture.source.scaleMode = "nearest";
  return createCharacterSpritesheet(texture, { width: 48, height: 64 });
}

export async function loadActorSpritesheets(
  modelId: ActorModelId,
): Promise<ReadonlyMap<ActorSpriteState, Spritesheet>> {
  return new Map(
    await Promise.all(
      actorSpriteStates.map(
        async (state): Promise<[ActorSpriteState, Spritesheet]> => [
          state,
          await loadActorSpritesheetForState(modelId, state),
        ],
      ),
    ),
  );
}

export async function loadAllActorSpritesheets(): Promise<
  ReadonlyMap<ActorModelId, ReadonlyMap<ActorSpriteState, Spritesheet>>
> {
  // TODO look up character model list from server
  const modelId = "adventurer" as ActorModelId; //
  return new Map([[modelId, await loadActorSpritesheets(modelId)]]);
}

export function ActorSpritesheetProvider(props: ParentProps) {
  const [spritesheets] = createResource(loadAllActorSpritesheets);
  return (
    <Show when={spritesheets()} keyed>
      {(loadedSpritesheets) => (
        <ActorSpritesheetContext.Provider value={loadedSpritesheets}>
          {props.children}
        </ActorSpritesheetContext.Provider>
      )}
    </Show>
  );
}
