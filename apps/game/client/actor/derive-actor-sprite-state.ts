import type { Actor } from "../../server";
import type { ActorSpriteState } from "./actor-sprite-state";

export function deriveActorSpriteState(actor: Actor): ActorSpriteState {
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
