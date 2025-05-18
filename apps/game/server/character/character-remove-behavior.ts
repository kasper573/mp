import type { UserId } from "@mp/auth";
import type { Logger } from "@mp/logger";
import type { ClientRegistry } from "../user/client-registry";
import type { GameStateMachine } from "../game-state";

export function characterRemoveBehavior(
  clients: ClientRegistry,
  state: GameStateMachine,
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

        logger.info("Scheduling character removal for user", user.id);
        const timeoutId = setTimeout(() => removeCharacter(user.id), timeout);
        removeTimeouts.set(user.id, timeoutId);
        break;
      }

      case "add": {
        const timeoutId = removeTimeouts.get(user.id);
        if (timeoutId) {
          logger.info("User reconnected, cancelling removal timeout");
          clearTimeout(timeoutId);
          removeTimeouts.delete(user.id);
        }
        break;
      }
    }
  });

  function removeCharacter(userId: UserId) {
    for (const char of state.actors
      .values()
      .filter((actor) => actor.type === "character")) {
      if (char.userId === userId) {
        logger.info("Removing character", char.id);
        state.actors.remove(char.id);
      }
    }
  }

  return stop;
}
