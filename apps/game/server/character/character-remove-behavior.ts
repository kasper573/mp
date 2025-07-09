import type { Logger } from "@mp/logger";
import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import type { ClientRegistry } from "../user/client-registry";
import type { GameState } from "../game-state";
import type { CharacterId } from "./types";

/**
 *  The client registry is the controller of which character SHOULD be in the game.
 *  If a character actor is present in the game state, but not in the client registry,
 *  this means that the player has logged out or disconnected and the character
 *  should be scheduled for removal.
 */
export function characterRemoveBehavior(
  clients: ClientRegistry,
  state: GameState,
  logger: Logger,
): TickEventHandler {
  const removeSchedules = new Map<CharacterId, TimeSpan>();

  return ({ totalTimeElapsed }) => {
    const registeredCharacterIds = new Set(clients.characterIds.values());

    for (const character of state.actors
      .values()
      .filter((a) => a.type === "character")) {
      if (!registeredCharacterIds.has(character.id)) {
        if (removeSchedules.has(character.id)) {
          // Already scheduled for removal, nothing else to do
        } else {
          logger.info(`Scheduling removal of character ${character.id}`);
          removeSchedules.set(character.id, totalTimeElapsed.add(removeDelay));
        }
      } else if (removeSchedules.has(character.id)) {
        logger.info(`Canceling scheduled removal of character ${character.id}`);
        removeSchedules.delete(character.id);
      }
    }

    for (const [characterId, removeTime] of removeSchedules.entries()) {
      if (totalTimeElapsed.compareTo(removeTime) >= 0) {
        logger.info(`Removing character ${characterId}`);
        state.actors.delete(characterId);
        removeSchedules.delete(characterId);
      }
    }
  };
}

const removeDelay = TimeSpan.fromSeconds(5);
