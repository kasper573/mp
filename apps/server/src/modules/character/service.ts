import { vec } from "@mp/math";
import { eq } from "drizzle-orm";
import type { UserId } from "@mp/auth-server";
import type { AreaId } from "@mp/data";
import type { DBClient } from "../../db/client";
import type { WorldState } from "../world/WorldState";
import type { AreaLookup } from "../area/loadAreas";
import { characterTable } from "./schema";
import type { Character } from "./schema";

export class CharacterService {
  private defaultAreaId: AreaId;

  constructor(
    private db: DBClient,
    public readonly areas: AreaLookup,
  ) {
    if (areas.size === 0) {
      throw new Error("CharacterService cannot be created without areas");
    }

    this.defaultAreaId = [...areas.keys()][0];
  }

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

    return { ...char, color: playerColor };
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
      color: playerColor,
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

const playerColor = 0x00_ff_00;
