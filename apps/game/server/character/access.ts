import type { GameRpcContext } from "../rpc";
import { ctxGameState } from "../game-state";
import { ctxClientId } from "../user/client-id";
import { ctxClientRegistry } from "../user/client-registry";
import type { CharacterId } from "./types";

export function accessCharacter(ctx: GameRpcContext, characterId: CharacterId) {
  const state = ctx.get(ctxGameState);
  const char = state.actors.get(characterId);
  const clientId = ctx.get(ctxClientId);
  const clients = ctx.get(ctxClientRegistry);
  const userId = clients.userIds.get(clientId);

  if (!char || char.type !== "character") {
    throw new Error("Character not found");
  }

  if (char.userId !== userId) {
    throw new Error("You don't have access to this character");
  }
  return char;
}
