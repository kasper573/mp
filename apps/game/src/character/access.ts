import { ctxGameState } from "../game-state/game-state";
import type { GameEventRouterContext } from "../network/event-builder";
import { ctxUserSession } from "../user/session";
import type { CharacterId } from "./types";

export function accessCharacter(
  ctx: GameEventRouterContext,
  characterId: CharacterId,
) {
  const state = ctx.get(ctxGameState);
  const char = state.actors.get(characterId);
  const session = ctx.get(ctxUserSession);

  if (!char || char.type !== "character") {
    throw new Error("Character not found");
  }

  if (char.identity.userId !== session.userId) {
    throw new Error("You don't have access to this character");
  }
  return char;
}
