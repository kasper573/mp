import { PersistenceId, type PersistenceSchema } from "@rift/persistence";
import { CharacterIdentity } from "../../components";

export const CHARACTER_METADATA_COLLECTION = "character_metadata";

export function buildCharacterMetadataPersistenceSchema(args: {
  instanceId: string;
  dbPath: string;
  saveInterval?: number;
  pollInterval?: number;
}): PersistenceSchema {
  return {
    instanceId: args.instanceId,
    dbPath: args.dbPath,
    saveInterval: args.saveInterval,
    pollInterval: args.pollInterval,
    collections: {
      [CHARACTER_METADATA_COLLECTION]: {
        keyComponent: PersistenceId,
        components: [CharacterIdentity],
        mode: "world",
      },
    },
  };
}
