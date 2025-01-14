import { vec } from "@mp/math";
import { eq } from "drizzle-orm";
import type { UserId } from "@mp/auth-server";
import type { AreaId, AreaResource } from "@mp/data";
import type { DBClient } from "../../db/client";
import { characterTable } from "./schema";
import type { Character, WorldState } from "./schema";

export class WorldService {
  constructor(
    private db: DBClient,
    private areas: Map<AreaId, AreaResource>,
    private defaultAreaId: AreaId,
  ) {}

  persistWorldState(state: WorldState) {
    return this.db.transaction((tx) =>
      Promise.all(
        Object.values(state.characters).map((char) => {
          return tx.insert(characterTable).values(char).onConflictDoUpdate({
            target: characterTable.id,
            set: char,
          });
        }),
      ),
    );
  }

  async getCharacterForUser(userId: UserId): Promise<Character | undefined> {
    const [char] = await this.db
      .select()
      .from(characterTable)
      .where(eq(characterTable.userId, userId))
      .limit(1);
    return char;
  }

  async getOrCreateCharacterForUser(userId: UserId): Promise<Character> {
    const char = await this.getCharacterForUser(userId);

    if (char) {
      return char;
    }

    const area = this.areas.get(this.defaultAreaId);
    if (!area) {
      throw new Error(
        "Could not create character, default area not found: " +
          this.defaultAreaId,
      );
    }

    const input = {
      areaId: area.id,
      coords: vec(0, 0),
      speed: 3,
      userId,
    };

    const [returned] = await this.db
      .insert(characterTable)
      .values(input)
      .returning({ id: characterTable.id });

    if (!returned) {
      throw new Error("Failed to insert character");
    }

    return { ...input, ...returned };
  }
}
