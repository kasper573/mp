import type { CharacterId } from "@mp/db/types";
import type { UserId } from "@mp/oauth";
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
  readonly identity!: CharacterIdentity;
  readonly appearance = new AppearanceTrait();
  readonly movement = new MovementTrait();
  readonly combat = new CombatTrait();
  readonly progression = new CharacterProgression();

  get alive() {
    return this.combat.health > 0;
  }
}
