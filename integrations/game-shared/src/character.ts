import type { CharacterId } from "@mp/db/types";
import type { UserId } from "@mp/oauth";
import { object, value } from "@mp/sync";
import { AppearanceTrait } from "./appearance";
import { CombatTrait } from "./combat";
import { MovementTrait } from "./movement";

export const Character = object({
  type: value<"character">(),
  identity: object({
    id: value<CharacterId>(),
    userId: value<UserId>(),
  }),
  appearance: AppearanceTrait,
  movement: MovementTrait,
  combat: CombatTrait,
  progression: object({
    xp: value<number>(),
  }),
});

export type Character = typeof Character.$infer;
