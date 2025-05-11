import type { Texture } from "pixi.js";
import { Assets, type Spritesheet } from "pixi.js";
import type { Branded } from "@mp/std";
import { createCharacterSpritesheet } from "./character-spritesheet";

export type CharacterSpriteState = (typeof characterSpriteStates)[number];

export const characterSpriteStates = Object.freeze([
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

export const loopedCharacterSpriteStates = characterSpriteStates.filter(
  (state) => !state.startsWith("death-"),
);

export async function loadCharacterSpritesheetForState(
  character: string,
  state: CharacterSpriteState,
): Promise<Spritesheet> {
  const { default: spritesheetUrl } = (await import(
    `../../../server/public/characters/${character}/${state}.png`
  )) as { default: string };
  const texture = await Assets.load<Texture>(spritesheetUrl);
  texture.source.scaleMode = "nearest";
  return createCharacterSpritesheet(texture, { width: 48, height: 64 });
}

export async function loadCharacterSpritesheets(
  character: string,
): Promise<ReadonlyMap<CharacterSpriteState, Spritesheet>> {
  return new Map(
    await Promise.all(
      characterSpriteStates.map(
        async (state): Promise<[CharacterSpriteState, Spritesheet]> => [
          state,
          await loadCharacterSpritesheetForState(character, state),
        ],
      ),
    ),
  );
}

export async function loadAllCharacterSpritesheets(): Promise<
  ReadonlyMap<CharacterModelId, ReadonlyMap<CharacterSpriteState, Spritesheet>>
> {
  return new Map([
    // TODO look up character model list from server
    [
      "adventurer" as CharacterModelId,
      await loadCharacterSpritesheets("adventurer"),
    ],
  ]);
}

export type CharacterModelId = Branded<string, "CharacterModelId">;
