import type { UserId } from "@mp/auth";
import type { Logger } from "@mp/logger";
import { recordValues } from "@mp/std";
import type { ClientRegistry } from "../user/client-registry";
import type { GameState } from "../game-state";

export function characterRemoveBehavior(
  clients: ClientRegistry,
  state: GameState,
  logger: Logger,
  timeout: number,
) {
  const removeTimeouts = new Map<UserId, NodeJS.Timeout>();

  const stop = clients.on(({ type, user }) => {
    switch (type) {
      case "remove": {
        if (clients.hasClient(user.id)) {
          // User is still connected with another client, no need to remove character
          break;
        }

        logger.info(
          { userId: user.id },
          "Scheduling character removal for user",
        );
        const timeoutId = setTimeout(() => removeCharacter(user.id), timeout);
        removeTimeouts.set(user.id, timeoutId);
        break;
      }

      case "add": {
        const timeoutId = removeTimeouts.get(user.id);
        if (timeoutId) {
          logger.info(
            { userId: user.id },
            "User reconnected, cancelling removal timeout",
          );
          clearTimeout(timeoutId);
          removeTimeouts.delete(user.id);
        }
        break;
      }
    }
  });

  function removeCharacter(userId: UserId) {
    for (const char of recordValues(state.actors).filter(
      (actor) => actor.type === "character",
    )) {
      if (char.userId === userId) {
        logger.info({ characterId: char.id }, "Removing character");
        delete state.actors[char.id];
      }
    }
  }

  return stop;
}
