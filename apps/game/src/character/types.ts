import type { UserId } from "@mp/oauth";
import type { Branded } from "@mp/std";
import type { SyncComponent } from "@mp/sync";
import { defineSyncComponent } from "@mp/sync";
import { AppearanceTrait } from "../traits/appearance";
import { CombatTrait } from "../traits/combat";
import { MovementTrait } from "../traits/movement";

import { computed } from "@mp/state";

type CharacterProgression = typeof CharacterProgression.$infer;

const CharacterProgression = defineSyncComponent((builder) =>
  builder.add<number>()("xp"),
);

export interface CharacterInit {
  identity: CharacterIdentity;
  appearance: AppearanceTrait;
  movement: MovementTrait;
  combat: CombatTrait;
  progression: CharacterProgression;
}

const CharacterIdentity = defineSyncComponent((builder) =>
  builder.add<CharacterId>()("id").add<UserId>()("userId"),
);

type CharacterIdentity = typeof CharacterIdentity.$infer;

const CharacterCommons = defineSyncComponent((builder) => builder);

export class Character extends CharacterCommons {
  readonly type = "character" as const;
  readonly identity: SyncComponent<CharacterIdentity>;
  readonly appearance: SyncComponent<AppearanceTrait>;
  readonly movement: SyncComponent<MovementTrait>;
  readonly combat: SyncComponent<CombatTrait>;
  readonly progression: SyncComponent<CharacterProgression>;

  alive = computed(() => this.combat.health > 0);

  constructor(init: CharacterInit) {
    super({});
    this.type = "character";
    this.identity = new CharacterIdentity(init.identity);
    this.appearance = new AppearanceTrait(init.appearance);
    this.movement = new MovementTrait(init.movement);
    this.combat = new CombatTrait(init.combat);
    this.progression = new CharacterProgression(init.progression);
  }
}

export type CharacterId = Branded<string, "CharacterId">;
