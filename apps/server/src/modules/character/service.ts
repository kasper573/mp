import { eq } from "drizzle-orm";
import type { UserId, UserIdentity } from "@mp/auth";
import type { AreaId } from "@mp/data";
import type { Tile } from "@mp/std";
import { uniqueNamesGenerator, names } from "unique-names-generator";
import type { DBClient } from "../../db/client";
import type { AreaLookup } from "../area/loadAreas";
import type { AppearanceTrait } from "../../package";
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

  private async getCharacterForUser(
    user: UserIdentity,
  ): Promise<Character | undefined> {
    const [char] = await this.db
      .select()
      .from(characterTable)
      .where(eq(characterTable.userId, user.id))
      .limit(1);

    return char
      ? {
          ...char,
          ...characterAppearance(user.id),
          name:
            user.name ??
            uniqueNamesGenerator({
              dictionaries: [names],
              seed: char.id,
            }),
        }
      : undefined;
  }

  async getOrCreateCharacterForUser(user: UserIdentity): Promise<Character> {
    const char = await this.getCharacterForUser(user);

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
      speed: 3 as Tile,
      userId: user.id,
      ...characterAppearance(user.id),
    };

    const [returned] = await this.db
      .insert(characterTable)
      .values(input)
      .returning({ id: characterTable.id });

    if (!returned) {
      throw new Error("Failed to insert character");
    }

    return {
      ...input,
      ...returned,
      name:
        user.name ??
        uniqueNamesGenerator({
          dictionaries: [names],
          seed: returned.id,
        }),
    };
  }
}

function characterAppearance(userId: UserId): Omit<AppearanceTrait, "name"> {
  return { color: 0x00_ff_00 };
}
