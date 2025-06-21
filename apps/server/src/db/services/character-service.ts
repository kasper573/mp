import type { UserId } from "@mp/auth";
import type { Rng } from "@mp/std";
import { assert, type Tile, type TimesPerSecond } from "@mp/std";
import { cardinalDirections } from "@mp/math";
import type {
  AreaId,
  AreaLookup,
  ActorModelLookup,
  AppearanceTrait,
  ActorModelId,
  Character,
  CharacterService as ICharacterService,
} from "@mp/game/server";
import { CharacterFactory } from "@mp/game/server";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { characterTable } from "../schema";
import type { UserService } from "./user-service";

export class CharacterService implements ICharacterService {
  private defaultAreaId: AreaId;

  constructor(
    private db: DbClient,
    private readonly userService: UserService,
    private readonly areas: AreaLookup,
    private readonly models: ActorModelLookup,
    private rng: Rng,
  ) {
    if (areas.size === 0) {
      throw new Error("CharacterService cannot be created without areas");
    }

    this.defaultAreaId = [...areas.keys()][0];
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

  async getOrCreateCharacterForUser(userId: UserId): Promise<Character> {
    const findResult = await this.db
      .select()
      .from(characterTable)
      .where(eq(characterTable.userId, userId))
      .limit(1);

    const name = await this.userService.getName(userId);
    let databaseFields = findResult.length > 0 ? findResult[0] : undefined;

    if (!databaseFields) {
      const input = {
        ...this.getDefaultSpawnPoint(),
        speed: 3 as Tile,
        health: 100,
        maxHealth: 100,
        attackDamage: 5,
        attackSpeed: 1.25 as TimesPerSecond,
        attackRange: 1 as Tile,
        userId,
        xp: 0,
        name,
        ...characterAppearance(userId),
      };

      const insertResult = await this.db
        .insert(characterTable)
        .values(input)
        .returning({ id: characterTable.id });

      const returned = insertResult.length > 0 ? insertResult[0] : undefined;
      if (!returned) {
        throw new Error("Failed to insert character");
      }

      databaseFields = { ...input, id: returned.id };
    }

    const model = assert(this.models.get(databaseFields.modelId));
    return CharacterFactory.create({
      type: "character",
      ...databaseFields,
      hitBox: model.hitBox,
      dir: this.rng.oneOf(cardinalDirections),
    });
  }
}

function characterAppearance(userId: UserId): Omit<AppearanceTrait, "name"> {
  return { color: undefined, modelId: "adventurer" as ActorModelId };
}
