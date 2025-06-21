import type { Logger } from "@mp/logger";
import { recordValues } from "@mp/std";
import type { TickEventHandler } from "@mp/time";
import type { ClientRegistry } from "../user/client-registry";
import type { GameState } from "../game-state";

export function characterRemoveBehavior(
  clients: ClientRegistry,
  state: GameState,
  logger: Logger,
): TickEventHandler {
  return () => {
    const registeredCharacterIds = new Set(clients.characterIds.values());

    for (const character of recordValues(state.actors).filter(
      (a) => a.type === "character",
    )) {
      if (!registeredCharacterIds.has(character.id)) {
        logger.info(
          { characterId: character.id },
          "Removing unregistered character",
        );
        delete state.actors[character.id];
      }
    }
  };
}
