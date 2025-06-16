import { recordValues } from "@mp/std";
import { ctxGameState } from "../game-state";
import { rpc } from "../rpc";
import { roles } from "../user/auth";
import { defineRoles } from "../user/define-roles";
import { ctxClientRegistry } from "../user/client-registry";
import { deriveClientVisibility } from "../user/client-visibility";
import { clientViewDistance } from "../../shared/client-view-distance-settings";
import { ctxAreaLookup } from "../area/lookup";
import type { Character, CharacterId } from "../character/types";
import type { UserId, UserIdentity } from "@mp/auth";
import type { ClientId } from "../user/client-id";
import type { GameState } from "../game-state";
import type { AreaId } from "../../shared/area/area-id";
import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";

export const spectatorRoles = defineRoles("spectator", ["view"]);

export interface PlayerInfo {
  characterId: CharacterId;
  userId: UserId;
  username: string;
  areaId: AreaId;
  coords: Vector<Tile>;
}

export interface PlayerGameStateInfo {
  gameState: GameState;
  characterId: CharacterId;
  areaId: AreaId;
}

export type SpectatorRouter = typeof spectatorRouter;
export const spectatorRouter = rpc.router({
  listActivePlayers: rpc.procedure
    .output<PlayerInfo[]>()
    .use(roles([spectatorRoles.view]))
    .query(({ ctx }) => {
      const state = ctx.get(ctxGameState);
      const clients = ctx.get(ctxClientRegistry);
      
      // Get all connected users
      const connectedUsers = new Map<UserId, UserIdentity>();
      for (const clientId of clients.getClientIds()) {
        const user = clients.getUser(clientId);
        if (user) {
          connectedUsers.set(user.id, user);
        }
      }
      
      // Get all active characters (players)
      const activeCharacters: PlayerInfo[] = recordValues(state.actors)
        .filter((actor): actor is Character => 
          actor.type === "character" && actor.health > 0
        )
        .map((character) => {
          const user = connectedUsers.get(character.userId);
          return {
            characterId: character.id,
            userId: character.userId,
            username: user?.name || "Unknown",
            areaId: character.areaId,
            coords: character.coords,
          };
        })
        .toArray();

      return activeCharacters;
    }),

  getPlayerGameState: rpc.procedure
    .input<{ userId: UserId }>()
    .output<PlayerGameStateInfo>()
    .use(roles([spectatorRoles.view]))
    .query(({ input: { userId }, ctx }) => {
      const state = ctx.get(ctxGameState);
      
      // Find the character for this user
      const character = recordValues(state.actors)
        .filter((actor): actor is Character => actor.type === "character")
        .find((actor) => actor.userId === userId);

      if (!character) {
        throw new Error("Player not found");
      }

      // For spectator mode, we'll return the full game state
      // The client will handle rendering from the perspective of the specified character
      return {
        gameState: state,
        characterId: character.id,
        areaId: character.areaId,
      };
    }),
});

export const spectatorRouterSlice = { spectator: spectatorRouter };