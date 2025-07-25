import type { GameEventRouterContext } from "../network/event-builder";
import { ctxGameplaySession } from "../user/session";
import type { CharacterId } from "./types";

export function accessCharacter(
  ctx: GameEventRouterContext,
  characterId: CharacterId,
) {
  const session = ctx.get(ctxGameplaySession);
  return session.characterId === characterId;
}
