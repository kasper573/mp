import { ActorModel, Character as CharacterEntity, Inventory } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { InjectionContainer } from "@mp/ioc";
import type { UserIdentity } from "@mp/oauth";
import type { Tile, TimesPerSecond } from "@mp/std";
import { unsafe } from "@mp/validate";
import { ctxDbClient } from "../context";
import { auth } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { getDefaultSpawnPoint } from "./default-spawn-point";

export const myCharacterId = rpc.procedure
  .use(auth())
  .output(unsafe<CharacterId>())
  .query(({ ctx }) => getOrCreateCharacterIdForUser(ctx.ioc, ctx.user));

async function getOrCreateCharacterIdForUser(
  ioc: InjectionContainer,
  user: UserIdentity,
): Promise<CharacterId> {
  const db = ioc.get(ctxDbClient);
  const existingCharacter = await db.getRepository(CharacterEntity).findOne({
    where: { userId: user.id },
    select: ["id"],
  });

  if (existingCharacter) {
    return existingCharacter.id;
  }

  const model = await db.getRepository(ActorModel).findOne({
    select: ["id"],
  });
  if (!model) {
    throw new Error("No actor models found in the database");
  }

  const inventory = new Inventory();
  const savedInventory = await db.getRepository(Inventory).save(inventory);

  const character = new CharacterEntity();
  const defaultSpawn = await getDefaultSpawnPoint(ioc);
  character.areaId = defaultSpawn.areaId;
  character.coords = defaultSpawn.coords;
  character.speed = 3 as Tile;
  character.health = 100;
  character.maxHealth = 100;
  character.attackDamage = 5;
  character.attackSpeed = 1.25 as TimesPerSecond;
  character.attackRange = 1 as Tile;
  character.userId = user.id;
  character.xp = 0;
  character.name = user.name;
  character.online = false;
  character.modelId = model.id;
  character.inventoryId = savedInventory.id;

  const savedCharacter = await db
    .getRepository(CharacterEntity)
    .save(character);

  return savedCharacter.id;
}
