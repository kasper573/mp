import type { Actor, ActorModelState } from "../../server";

export function deriveActorSpriteState(actor: Actor): ActorModelState {
  if (actor.health <= 0) {
    return "death-spear";
  }
  if (actor.path) {
    if (actor.speed >= 2) {
      return "run-spear";
    }
    return "walk-spear";
  }
  return "idle-spear";
}
