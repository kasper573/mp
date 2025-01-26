import { eq } from "drizzle-orm";
import type { UserId } from "@mp/auth-server";
import type { AreaId } from "@mp/data";
import type { TileNumber } from "@mp/std";
import type { DBClient } from "../../db/client";
import type { AreaLookup } from "../area/loadAreas";
import { characterTable } from "./schema";
import type { Character } from "./schema";

export class CharacterService {
  private defaultAreaId: AreaId;

  constructor(
    private db: DBClient,
    private readonly areas: AreaLookup,
  ) {
    if (areas.size === 0) {
      throw new Error("CharacterService cannot be created without areas");
    }

    this.defaultAreaId = [...areas.keys()][0];
  }

  async getCharacterForUser(userId: UserId): Promise<Character | undefined> {
    const [char] = await this.db
      .select()
      .from(characterTable)
      .where(eq(characterTable.userId, userId))
      .limit(1);

    return char ? { ...char, color: playerColor } : undefined;
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
      coords: area.start,
      speed: 3 as TileNumber,
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
