import type { Branded } from "@mp/std";
import type { UserId } from "@mp/auth";
import type { MovementTrait } from "../traits/movement";
import { type AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";

export interface Character extends AppearanceTrait, MovementTrait, CombatTrait {
  id: CharacterId;
  userId: UserId;
  xp: number;
}

export type CharacterId = Branded<string, "CharacterId">;
