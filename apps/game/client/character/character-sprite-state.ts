import type { Texture } from "pixi.js";
import { Assets, type Spritesheet } from "pixi.js";
import { createCharacterSpritesheet } from "./character-spritesheet";

export type CharacterSpriteState =
  | "attack-shooting"
  | "attack-spear"
  | "dash-dust"
  | "dash-gun"
  | "dash-normal"
  | "dash-shadow"
  | "dash-spear"
  | "death-gun"
  | "death-normal"
  | "death-shadow-gun"
  | "death-shadow-normal"
  | "death-shadow-spear"
  | "death-spear"
  | "idle-gun"
  | "idle-normal"
  | "idle-spear"
  | "jump-dust"
  | "jump-gun"
  | "jump-normal"
  | "jump-shadow"
  | "jump-spear"
  | "reloading"
  | "run-gun"
  | "run-normal"
  | "run-shooting"
  | "run-spear"
  | "shadow"
  | "walk-aiming"
  | "walk-gun"
  | "walk-normal"
  | "walk-reloading"
  | "walk-shooting"
  | "walk-spear";

export async function loadCharacterSpritesheetForState(
  state: CharacterSpriteState,
): Promise<Spritesheet> {
  const { default: spritesheetUrl } = (await import(
    `../../../server/public/characters/adventurer/${state}.png`
  )) as { default: string };
  const texture = await Assets.load<Texture>(spritesheetUrl);
  texture.source.scaleMode = "nearest";
  return createCharacterSpritesheet(texture, { width: 48, height: 64 });
}
