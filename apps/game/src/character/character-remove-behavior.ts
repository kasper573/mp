import type { Logger } from "@mp/logger";
import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import type { CharacterId } from "./types";
import type { GameState } from "../game-state/game-state";

/**
 * This behavior allows character actors to remain in the game for a duration even if detected as offline.
 * This prevents players from abusing the system by quickly going offline to avoid ie. dying in a difficult situation and waiting for enemies to disappear.
 * It also allows for connections to be slightly unstable and lets characters stay in game even if a connection drops for a moment.
 */
export function characterRemoveBehavior(
  state: GameState,
  logger: Logger,
): TickEventHandler {
  const removeSchedules = new Map<CharacterId, TimeSpan>();

  return ({ totalTimeElapsed }) => {
    const registeredCharacterIds = new Set(
      state.actors.values().map((a) => a.identity.id),
    );

    for (const character of state.actors
      .values()
      .filter((a) => a.type === "character")) {
      if (!registeredCharacterIds.has(character.identity.id)) {
        if (removeSchedules.has(character.identity.id)) {
          // Already scheduled for removal, nothing else to do
        } else {
          logger.info(
            `Scheduling removal of character ${character.identity.id}`,
          );
          removeSchedules.set(
            character.identity.id,
            totalTimeElapsed.add(removeDelay),
          );
        }
      } else if (removeSchedules.has(character.identity.id)) {
        logger.info(
          `Canceling scheduled removal of character ${character.identity.id}`,
        );
        removeSchedules.delete(character.identity.id);
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
