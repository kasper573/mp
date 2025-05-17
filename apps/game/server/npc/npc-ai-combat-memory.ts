import type { ActorId } from "../traits/actor";

/**
 * Details about the combats that npcs has observed
 */

export class NpcAiCombatMemory {
  private attacks = new Map<ActorId, Set<ActorId>>();

  hasAttackedEachOther(actor1: ActorId, actor2: ActorId): boolean {
    const targetsForActor1 = this.attacks.get(actor1);
    if (targetsForActor1?.has(actor2)) {
      return true;
    }
    const targetsForActor2 = this.attacks.get(actor1);
    if (targetsForActor2?.has(actor1)) {
      return true;
    }
    return false;
  }

  observeAttack(attacker: ActorId, target: ActorId) {
    let targets = this.attacks.get(attacker);
    if (!targets) {
      targets = new Set<ActorId>();
      this.attacks.set(attacker, targets);
    }
    targets.add(target);
  }
}
