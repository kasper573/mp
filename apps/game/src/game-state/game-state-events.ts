import type { ActorId } from "../actor/actor";

// oxlint-disable-next-line consistent-type-definitions This needs to be a record type, so can't use interface
export type GameStateEvents = {
  "combat.attack": {
    actorId: ActorId;
    targetId: ActorId;
  };
  "actor.death": ActorId;
  /**
   * Just an aid to the optimistic client side game state.
   * It needs to know that it's okay to stop immediately and not let the interpolation finish.
   */
  "movement.stop": ActorId;
};
