import type { ActorId } from "./traits/actor";

export type GameStateEvents = {
  "combat.attack": {
    actorId: ActorId;
    targetId: ActorId;
  };
  /**
   * Just an aid to the optimistic client side game state.
   * It needs to know that it's okay to stop immediately and not let the interpolation finish.
   */
  "movement.stop": ActorId;
};
