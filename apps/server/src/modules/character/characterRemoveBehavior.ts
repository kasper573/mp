import type { UserId } from "@mp/auth-server";
import type { PatchStateMachine } from "@mp/sync-server";
import type { Logger } from "@mp/logger";
import { recordValues } from "@mp/std";
import type { ClientRegistry } from "../../ClientRegistry.ts";
import type { WorldState } from "../world/WorldState.ts";

export function characterRemoveBehavior(
  clients: ClientRegistry,
  state: PatchStateMachine<WorldState>,
  logger: Logger,
  timeout: number,
) {
  const removeTimeouts = new Map<UserId, number>();

  const stop = clients.on(({ type, userId }) => {
    switch (type) {
      case "remove": {
        logger.info("Scheduling character removal for user", userId);
        const timeoutId = setTimeout(() => removeCharacter(userId), timeout);
        removeTimeouts.set(userId, timeoutId);
        break;
      }

      case "add": {
        const timeoutId = removeTimeouts.get(userId);
        if (timeoutId) {
          logger.info("User reconnected, cancelling removal timeout");
          clearTimeout(timeoutId);
          removeTimeouts.delete(userId);
        }
        break;
      }
    }
  });

  function removeCharacter(userId: UserId) {
    for (
      const char of recordValues(state.actors()).filter(
        (actor) => actor.type === "character",
      )
    ) {
      if (char.userId === userId) {
        logger.info("Removing character", char.id);
        state.actors.remove(char.id);
      }
    }
  }

  return stop;
}
