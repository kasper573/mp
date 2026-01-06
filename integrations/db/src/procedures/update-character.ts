import { and, eq, not } from "drizzle-orm";
import { characterTable } from "../schema";
import type { CharacterId } from "@mp/game-shared";
import { procedure } from "../utils/procedure";
import { err, ok } from "@mp/std";

export const updateCharacter = procedure()
  .input<{ characterId: CharacterId; newName: string }>()
  .error<UpdateCharacterErrors>()
  .query(async (drizzle, { characterId, newName }) => {
    const isNameTaken = await drizzle.$count(
      drizzle
        .select()
        .from(characterTable)
        .where(
          and(
            eq(characterTable.name, newName),
            not(eq(characterTable.id, characterId)),
          ),
        ),
    );

    if (isNameTaken) {
      return err({ type: "nameAlreadyTaken" as const, name: newName });
    }

    const result = await drizzle
      .update(characterTable)
      .set({ name: newName })
      .where(and(eq(characterTable.id, characterId)));

    if (!result.rowCount) {
      throw new Error("No character found with the given ID");
    }

    return ok(void 0);
  });

// Future proofing for more error types when adding more character fields
export type UpdateCharacterErrors = NameAlreadyTakenError;

export interface NameAlreadyTakenError {
  type: "nameAlreadyTaken";
  name: string;
}
