import type { UserIdentity } from "@mp/auth";
import { eq } from "drizzle-orm";
import { actorModelTable, areaTable, characterTable } from "../schema";
import type { CharacterId } from "@mp/world";
import { procedure } from "../utils/procedure";

export const selectOrCreateCharacterIdForUser = procedure()
  .input<{ user: UserIdentity }>()
  .query(async (drizzle, { user }): Promise<CharacterId> => {
    const findResult = await drizzle
      .select({ id: characterTable.id })
      .from(characterTable)
      .where(eq(characterTable.userId, user.id))
      .limit(1);

    if (findResult.length) {
      return findResult[0].id;
    }

    const [model] = await drizzle
      .select({ id: actorModelTable.id })
      .from(actorModelTable)
      .limit(1);
    if (!model) {
      throw new Error("No actor models found in the database");
    }

    const [area] = await drizzle
      .select({ id: areaTable.id })
      .from(areaTable)
      .limit(1);
    if (!area) {
      throw new Error("No areas found in the database");
    }

    const insertResult = await drizzle
      .insert(characterTable)
      .values({
        userId: user.id,
        areaId: area.id,
        name: user.name,
        modelId: model.id,
      })
      .returning({ id: characterTable.id });

    const returned = insertResult.length > 0 ? insertResult[0] : undefined;
    if (!returned) {
      throw new Error("Failed to insert character");
    }

    return returned.id;
  });
