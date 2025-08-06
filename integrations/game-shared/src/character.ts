import type { CharacterId } from "@mp/db/types";
import type { UserId } from "@mp/oauth";
import { tracked } from "@mp/sync";
import { AppearanceTrait } from "./appearance";
import { CombatTrait } from "./combat";
import { EncoderTag } from "./encoding";
import { MovementTrait } from "./movement";

@tracked(EncoderTag.CharacterProgression)
class CharacterProgression {
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

@tracked(EncoderTag.Character)
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
    this.appearance = Object.assign(new AppearanceTrait(), init.appearance);
    this.movement = Object.assign(new MovementTrait(), init.movement);
    this.combat = Object.assign(new CombatTrait(), init.combat);
    this.progression = Object.assign(
      new CharacterProgression(),
      init.progression,
    );
  }
}
