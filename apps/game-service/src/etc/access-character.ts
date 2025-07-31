import type { CharacterId } from "@mp/db/types";
import type { Character } from "@mp/game-shared";
import type { InjectionContainer } from "@mp/ioc";
import { ctxGameState, ctxUserSession } from "../context";

export function accessCharacter(
  ctx: InjectionContainer,
  characterId: CharacterId,
): Character {
  const session = ctx.get(ctxUserSession);
  const state = ctx.get(ctxGameState);
  const character = state.actors.get(characterId) as Character | undefined;
  if (!character) {
    throw new Error("Unknown character");
  }
  if (session.characterId !== characterId) {
    throw new Error("User does not have access to character");
  }
  return character;
}
