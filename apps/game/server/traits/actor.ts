import { EntityOptimizerBuilder, PatchCollectorFactory } from "@mp/sync";
import { isPathEqual } from "@mp/math";
import type { Character, CharacterId } from "../character/types";
import type { NpcInstance, NpcInstanceId } from "../npc/types";

export type ActorId = NpcInstanceId | CharacterId;

export type Actor =
  | ({ type: "character" } & Character)
  | ({ type: "npc" } & NpcInstance);

export const ActorFactory = new PatchCollectorFactory<Actor>(
  new EntityOptimizerBuilder<Actor>()
    .property("coords", (b) =>
      b.filter(
        (newValue, oldValue) =>
          // Since the client lerps coords along its current path we don't need to
          // send actual coordinate updates at a high frequency, so only sending
          // the new value when it's a new integer value is a good enough frequency.
          // It's a bit unsafe since we rely on coords always converging on a whole number,
          // but the movement system should always ensure that, so it's fine.
          !newValue.round().equals(oldValue.round()) ||
          // If we go from fraction to whole number that means we may have stopped at a location,
          // in which case the clients will need the new exact tile coordinate.
          (!newValue.isFraction(0.01) && oldValue.isFraction(0.01)),
      ),
    )
    .property("path", (b) =>
      // The client never need to see the whole path, just enough to do lerping
      b
        .transform((value) => value?.slice(0, 2))
        .filter((a, b) => !isPathEqual(a, b)),
    )
    // Clients never use these properties for anything, so we don't need to send them.
    // HACK typescript will still allow you to use these in the client, and those values will always be stale.
    // TODO we should consider creating a client/server model separation instead and make it impossible for the client to rely on these.
    .property("moveTarget", (b) => b.filter(noop))
    .property("lastAttack", (b) => b.filter(noop))
    .build(),
);

function noop() {
  return false;
}
