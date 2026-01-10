import type { CharacterId } from "@mp/game-shared";
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
    throw new Error(`Character "${characterId}" not found in game state`);
  }
  if (session.character?.id !== characterId) {
    let errorMessage = `User "${session.user?.id}" does not have access to character "${characterId}"`;
    if (session.character) {
      errorMessage += ` (they have claimed character "${session.character.id}")`;
    } else {
      errorMessage += " (they have claimed no character)";
    }
    throw new Error(errorMessage);
  }
  return character;
}
