import type { DBClient } from "@mp-modules/db";
import { eq } from "@mp-modules/db";
import type { UserId, UserIdentity } from "@mp/auth";
import type { AreaId } from "@mp-modules/data";
import type { Tile, TimesPerSecond } from "@mp/std";
import { uniqueNamesGenerator, names } from "unique-names-generator";
import { rect_from_diameter, vec_zero } from "@mp/math";
import { InjectionContext } from "@mp/ioc";
import type { AreaLookup } from "@mp-modules/area";
import type { AppearanceTrait } from "../traits/appearance";
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
          hitBox: rect_from_diameter(vec_zero(), 1 as Tile),
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
      health: 100,
      maxHealth: 100,
      attackDamage: 5,
      attackSpeed: 1 as TimesPerSecond,
      attackRange: 1 as Tile,
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
      hitBox: rect_from_diameter(vec_zero(), 1 as Tile),
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

export const ctx_characterService = InjectionContext.new<CharacterService>();
