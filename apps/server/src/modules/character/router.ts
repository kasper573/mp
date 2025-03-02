import { type Vector } from "@mp/math";
import type { PatchStateMachine } from "@mp/sync/server";
import { TRPCError } from "@trpc/server";
import { recordValues, type Tile } from "@mp/std";
import { auth, roles } from "../../middlewares/auth";
import { schemaFor, t } from "../../trpc";
import type { ActorId } from "../world/WorldState";
import { type WorldState } from "../world/WorldState";
import type { AreaLookup } from "../area/loadAreas";
import { canSeeSubject } from "../world/clientVisibility";
import { type CharacterId } from "./schema";
import type { CharacterService } from "./service";

export interface CharacterRouterDependencies {
  state: PatchStateMachine<WorldState>;
  areas: AreaLookup;
  characterService: CharacterService;
}

export type CharacterRouter = ReturnType<typeof createCharacterRouter>;
export function createCharacterRouter({
  state,
  areas,
  characterService,
}: CharacterRouterDependencies) {
  return t.router({
    move: t.procedure
      .input(schemaFor<{ characterId: CharacterId; to: Vector<Tile> }>())
      .use(roles(["move_character"]))
      .mutation(({ input: { characterId, to }, ctx: { user } }) => {
        const char = state.actors()[characterId];

        if (!char || char.type !== "character") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Character not found",
          });
        }

        if (char.userId !== user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this character",
          });
        }

        state.actors.update(char.id, {
          attackTargetId: undefined,
          moveTarget: to,
        });
      }),

    attack: t.procedure
      .input(schemaFor<{ characterId: CharacterId; targetId: ActorId }>())
      .use(roles(["character_attack"]))
      .mutation(
        ({ input: { characterId, targetId }, ctx: { user, clients } }) => {
          const char = state.actors()[characterId];

          if (!char || char.type !== "character") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Character not found",
            });
          }

          if (char.userId !== user.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You don't have access to this character",
            });
          }

          const target = state.actors()[targetId];
          if (!target) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Target not found",
            });
          }

          if (!canSeeSubject(char, target)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can't attack this target",
            });
          }

          state.actors.update(characterId, {
            attackTargetId: targetId,
          });
        },
      ),

    join: t.procedure
      .output(schemaFor<CharacterId>())
      .use(auth())
      .mutation(async ({ ctx: { user } }) => {
        const existingCharacter = recordValues(state.actors())
          .filter((actor) => actor.type === "character")
          .find((actor) => actor.userId === user.id);

        if (existingCharacter) {
          return existingCharacter.id;
        }

        const char = await characterService.getOrCreateCharacterForUser(user);
        state.actors.set(char.id, { type: "character", ...char });
        return char.id;
      }),
  });
}
