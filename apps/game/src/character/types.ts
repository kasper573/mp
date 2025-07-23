import type { Branded } from "@mp/std";
import type { UserId } from "@mp/auth";
import { createSyncComponent, SyncEntity } from "@mp/sync";
import { createMovementTrait, type MovementTrait } from "../traits/movement";
import {
  createAppearanceTrait,
  type AppearanceTrait,
} from "../traits/appearance";
import { createCombatTrait, type CombatTrait } from "../traits/combat";

import { computed } from "@mp/state";

interface CharacterIdentity {
  id: CharacterId;
  userId: UserId;
}

interface CharacterProgression {
  xp: number;
}

export type CharacterInit = Pick<
  Character,
  "identity" | "appearance" | "movement" | "combat" | "progression"
>;

export class Character extends SyncEntity {
  readonly type = "character" as const;
  readonly identity: CharacterIdentity;
  readonly appearance: AppearanceTrait;
  readonly movement: MovementTrait;
  readonly combat: CombatTrait;
  readonly progression: CharacterProgression;

  alive = computed(() => this.combat.health > 0);

  constructor(init: CharacterInit) {
    super();
    this.type = "character";
    this.identity = createSyncComponent(init.identity);
    this.appearance = createAppearanceTrait(init.appearance);
    this.movement = createMovementTrait(init.movement);
    this.combat = createCombatTrait(init.combat);
    this.progression = createSyncComponent(init.progression);
  }
}

export type CharacterId = Branded<string, "CharacterId">;
