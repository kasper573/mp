import type { UserId, UserIdentity } from "@mp/auth";
import type { Rng } from "@mp/std";
import { assert, type Tile, type TimesPerSecond } from "@mp/std";
import { uniqueNamesGenerator, names } from "unique-names-generator";
import { cardinalDirections, Rect, Vector } from "@mp/math";
import { InjectionContext } from "@mp/ioc";
import type {
  AreaId,
  AreaLookup,
  ActorModelLookup,
  AppearanceTrait,
  ActorModelId,
  Character,
} from "@mp/game/server";
import { CharacterFactory } from "@mp/game/server";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { characterTable } from "../schema";

export class CharacterService {
  private defaultAreaId: AreaId;

  constructor(
    private db: DbClient,
    private readonly areas: AreaLookup,
    private readonly models: ActorModelLookup,
    private rng: Rng,
  ) {
    if (areas.size === 0) {
      throw new Error("CharacterService cannot be created without areas");
    }

    this.defaultAreaId = [...areas.keys()][0];
  }

  private async getCharacterForUser(
    user: UserIdentity,
  ): Promise<Character | undefined> {
    const result = await this.db
      .select()
      .from(characterTable)
      .where(eq(characterTable.userId, user.id))
      .limit(1);

    const databaseFields = result.length > 0 ? result[0] : undefined;
    if (!databaseFields) {
      return;
    }
    const model = assert(this.models.get(databaseFields.modelId));
    return CharacterFactory.create({
      type: "character",
      ...databaseFields,
      hitBox: model.hitBox,
      dir: this.rng.oneOf(cardinalDirections),
      name:
        user.name ??
        uniqueNamesGenerator({
          dictionaries: [names],
          seed: databaseFields.id,
        }),
    });
  }

  getDefaultSpawnPoint() {
    const area = this.areas.get(this.defaultAreaId);
    if (!area) {
      throw new Error("Default area not found: " + this.defaultAreaId);
    }

    return {
      areaId: area.id,
      coords: area.start,
    };
  }

  async getOrCreateCharacterForUser(user: UserIdentity): Promise<Character> {
    const char = await this.getCharacterForUser(user);

    if (char) {
      return char;
    }

    const input = {
      ...this.getDefaultSpawnPoint(),
      speed: 3 as Tile,
      health: 100,
      maxHealth: 100,
      attackDamage: 5,
      attackSpeed: 1 as TimesPerSecond,
      attackRange: 1 as Tile,
      userId: user.id,
      xp: 0,
      name:
        user.name ??
        uniqueNamesGenerator({
          dictionaries: [names],
          seed: user.id,
        }),
      ...characterAppearance(user.id),
    };

    const result = await this.db
      .insert(characterTable)
      .values(input)
      .returning({ id: characterTable.id });

    const returned = result.length > 0 ? result[0] : undefined;
    if (!returned) {
      throw new Error("Failed to insert character");
    }

    return CharacterFactory.create({
      type: "character",
      ...input,
      ...returned,
      hitBox: Rect.fromDiameter(Vector.zero(), 1 as Tile),
      dir: this.rng.oneOf(cardinalDirections),
    });
  }
}

function characterAppearance(userId: UserId): Omit<AppearanceTrait, "name"> {
  return { color: undefined, modelId: "adventurer" as ActorModelId };
}

export const ctxCharacterService =
  InjectionContext.new<CharacterService>("CharacterService");
