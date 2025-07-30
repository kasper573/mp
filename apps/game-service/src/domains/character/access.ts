import type { CharacterId } from "@mp/db/types";
import type { Character } from "@mp/game-shared";
import { ctxGameState, ctxUserSession } from "@mp/game-shared";
import type { GameEventRouterContext } from "../network/event-builder";

export function accessCharacter(
  ctx: GameEventRouterContext,
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
