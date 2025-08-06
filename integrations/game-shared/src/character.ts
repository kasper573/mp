import type { CharacterId } from "@mp/db/types";
import type { UserId } from "@mp/oauth";
import { typedAssign } from "@mp/std";
import { tracked } from "@mp/sync";
import { AppearanceTrait } from "./appearance";
import { CombatTrait } from "./combat";
import { MovementTrait } from "./movement";

@tracked()
export class CharacterProgression {
  xp!: number;
}

export interface CharacterInit {
  identity: CharacterIdentity;
  appearance: AppearanceTrait;
  movement: MovementTrait;
  combat: CombatTrait;
  progression: CharacterProgression;
}

interface CharacterIdentity {
  readonly id: CharacterId;
  readonly userId: UserId;
}

@tracked()
export class Character {
  readonly type = "character" as const;
  readonly identity: CharacterIdentity;
  readonly appearance: AppearanceTrait;
  readonly movement: MovementTrait;
  readonly combat: CombatTrait;
  readonly progression: CharacterProgression;

  get alive() {
    return this.combat.health > 0;
  }

  constructor(init: CharacterInit) {
    this.identity = init.identity;
    this.appearance = typedAssign(new AppearanceTrait(), init.appearance);
    this.movement = typedAssign(new MovementTrait(), init.movement);
    this.combat = typedAssign(new CombatTrait(), init.combat);
    this.progression = typedAssign(
      new CharacterProgression(),
      init.progression,
    );
  }
}
