import type { Branded } from "@mp/std";
import type { UserId } from "@mp/auth";
import { PatchCollectorFactory } from "@mp/sync";
import type { MovementTrait } from "../traits/movement";
import { type AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";
import * as patchOptimizers from "../patch-optimizers";

export interface Character extends AppearanceTrait, MovementTrait, CombatTrait {
  type: "character";
  id: CharacterId;
  userId: UserId;
  xp: number;
}

export const CharacterFactory = new PatchCollectorFactory<Character>(
  patchOptimizers,
);

export type CharacterId = Branded<string, "CharacterId">;
