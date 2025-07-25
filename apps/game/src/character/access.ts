import type { GameEventRouterContext } from "../network/event-builder";
import { ctxUserSession } from "../user/session";
import type { Character, CharacterId } from "./types";
import { ctxGameState } from "../game-state/game-state";

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
  if (session.player?.characterId !== characterId) {
    throw new Error("User does not have access to character");
  }
  return character;
}
