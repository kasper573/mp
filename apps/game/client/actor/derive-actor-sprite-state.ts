import type { Actor, ActorModelState } from "../../server";

export function deriveActorSpriteState(actor: Actor): ActorModelState {
  if (actor.health <= 0) {
    return "death-gun";
  }
  if (actor.path) {
    if (actor.speed > 2) {
      if (actor.attackTargetId) {
        return "run-shooting";
      }
      return "run-gun";
    }
    if (actor.attackTargetId) {
      return "walk-shooting";
    }
    return "walk-gun";
  }
  if (actor.attackTargetId) {
    return "attack-shooting";
  }
  return "idle-gun";
}
