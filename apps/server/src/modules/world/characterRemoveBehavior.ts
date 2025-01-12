import type { UserId } from "@mp/auth-server";
import type { StateAccess } from "@mp/sync/server";
import type { Logger } from "@mp/logger";
import type { ClientRegistry } from "./ClientRegistry";
import type { WorldState } from "./schema";

export function characterRemoveBehavior(
  clients: ClientRegistry,
  accessState: StateAccess<WorldState>,
  logger: Logger,
  timeout: number,
) {
  const removeTimeouts = new Map<UserId, NodeJS.Timeout>();

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
    accessState("removeCharacter", (state) => {
      for (const char of Object.values(state.characters)) {
        if (char.userId === userId) {
          logger.info("Removing character", char.id);
          delete state.characters[char.id];
        }
      }
    });
  }

  return stop;
}
