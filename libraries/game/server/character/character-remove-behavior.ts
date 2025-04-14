import type { UserId } from "@mp/auth";
import type { PatchStateMachine } from "@mp/sync";
import type { Logger } from "@mp/logger";
import { recordValues } from "@mp/std";
import type { ClientRegistry } from "../client-registry";
import type { GameState } from "../game-state";

export function characterRemoveBehavior(
  clients: ClientRegistry,
  state: PatchStateMachine<GameState>,
  logger: Logger,
  timeout: number,
) {
  const removeTimeouts = new Map<UserId, NodeJS.Timeout>();

  const stop = clients.on(({ type, userId }) => {
    switch (type) {
      case "remove": {
        if (clients.hasClient(userId)) {
          // User is still connected with another client, no need to remove character
          break;
        }

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
    for (const char of recordValues(state.actors()).filter(
      (actor) => actor.type === "character",
    )) {
      if (char.userId === userId) {
        logger.info("Removing character", char.id);
        state.actors.remove(char.id);
      }
    }
  }

  return stop;
}
