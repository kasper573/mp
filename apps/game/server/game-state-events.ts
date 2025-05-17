import type { ActorId } from "./traits/actor";

export type GameStateEvents = {
  "combat.attack": {
    actorId: ActorId;
    targetId: ActorId;
  };
};
