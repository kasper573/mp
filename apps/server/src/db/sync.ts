import type { Logger } from "@mp/logger";
import type { WorldState } from "../modules/world/schema";
import { characterTable, serializeCharacter } from "../modules/world/schema";
import type { DBClient } from "./client";

export function createDBSync({
  db,
  logger,
  interval,
  getSnapshot,
}: {
  db: DBClient;
  logger: Logger;
  interval: number;
  getSnapshot: () => WorldState;
}) {
  return {
    start() {
      logger.info("Starting persistence...");
      let isStopped = false;
      async function save() {
        if (isStopped) {
          return;
        }

        const state = getSnapshot();

        try {
          await db.transaction((tx) =>
            Promise.all([
              ...Array.from(state.characters.values()).map((char) => {
                const values = serializeCharacter(char);
                return tx
                  .insert(characterTable)
                  .values(values)
                  .onConflictDoUpdate({
                    target: characterTable.id,
                    set: values,
                  });
              }),
            ]),
          );
        } catch (error) {
          logger.error("Failed to save state", error);
        }

        setTimeout(save, interval);
      }

      setTimeout(save, interval);

      return function stop() {
        logger.info("Stopping persistence...");
        isStopped = true;
      };
    },
  };
}
