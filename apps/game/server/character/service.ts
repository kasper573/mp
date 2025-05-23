import type { DbClient } from "@mp/db";
import { eq } from "@mp/db";
import type { UserId, UserIdentity } from "@mp/auth";
import type { RNG } from "@mp/std";
import { assert, randomItem, type Tile, type TimesPerSecond } from "@mp/std";
import { uniqueNamesGenerator, names } from "unique-names-generator";
import { cardinalDirections, Rect, Vector } from "@mp/math";
import { InjectionContext } from "@mp/ioc";
import type {
  ActorModelId,
  ActorModelLookup,
  AppearanceTrait,
} from "../traits/appearance";
import type { AreaLookup } from "../area/lookup";
import type { AreaId } from "../../shared/area/area-id";
import { characterTable } from "./schema";
import type { Character } from "./schema";

export class CharacterService {
  private defaultAreaId: AreaId;

  constructor(
    private db: DbClient,
    private readonly areas: AreaLookup,
    private readonly models: ActorModelLookup,
    private rng: RNG,
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

    const char = result.length > 0 ? result[0] : undefined;
    if (!char) {
      return;
    }
    const model = assert(this.models.get(char.modelId));
    return {
      ...char,
      hitBox: model.hitBox,
      dir: assert(randomItem(cardinalDirections, this.rng)),
      name:
        user.name ??
        uniqueNamesGenerator({
          dictionaries: [names],
          seed: char.id,
        }),
    };
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

    return {
      ...input,
      ...returned,
      hitBox: Rect.fromDiameter(Vector.zero(), 1 as Tile),
      dir: assert(randomItem(cardinalDirections, this.rng)),
    };
  }
}

function characterAppearance(userId: UserId): Omit<AppearanceTrait, "name"> {
  return { color: undefined, modelId: "adventurer" as ActorModelId };
}

export const ctxCharacterService =
  InjectionContext.new<CharacterService>("CharacterService");
