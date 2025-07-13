import type { Branded } from "@mp/std";
import type { ActorId } from "../actor/actor";

/**
 * Combats that a single npc has observed
 */
export class NpcAiCombatMemory {
  #combats = new Map<CombatId, [ActorId, ActorId]>();

  get combats() {
    return this.#combats.values();
  }

  hasAttackedEachOther(actor1: ActorId, actor2: ActorId): boolean {
    return this.#combats.has(createCombatId(actor1, actor2));
  }

  observeAttack(attacker: ActorId, target: ActorId) {
    const combatId = createCombatId(attacker, target);
    if (!this.#combats.has(combatId)) {
      this.#combats.set(combatId, [attacker, target]);
    }
  }

  forgetCombatatants(actorIds: ActorId[]) {
    const combatIdsToForget = this.#combats
      .entries()
      .filter(([, combatants]) =>
        combatants.some((id) => actorIds.includes(id)),
      )
      .map(([combatId]) => combatId);

    for (const id of combatIdsToForget) {
      this.#combats.delete(id);
    }
  }
}

type CombatId = Branded<string, "CombatId">;

function createCombatId(actor1: ActorId, actor2: ActorId): CombatId {
  // Sorting to ensure order is irrelevant and we only have one combat id per actor pair
  return [actor1, actor2].toSorted().join("_") as CombatId;
}
