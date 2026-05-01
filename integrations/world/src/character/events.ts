import { array, object, string } from "@rift/types";
import type { CharacterId, InventoryId } from "../identity/ids";
import { TileVector } from "../movement/components";

export const JoinAsPlayer = object({
  characterId: string<CharacterId>(),
});

export const JoinAsSpectator = object({
  characterId: string<CharacterId>(),
});

export const Leave = object({});

export const Respawn = object({});

export const Recall = object({});

export const RequestFullState = object({});

export const ListCharactersRequest = object({});

export const CharacterSummary = object({
  id: string<CharacterId>(),
  name: string(),
});

export const CharacterListResponse = object({
  characters: array(CharacterSummary),
});

export const CreateCharacterRequest = object({
  name: string(),
});

export const CharacterCreatedResponse = object({
  character: CharacterSummary,
});

export const DeleteCharacterRequest = object({
  characterId: string<CharacterId>(),
});

export const CharacterDeletedResponse = object({
  characterId: string<CharacterId>(),
});

export const RenameCharacterRequest = object({
  characterId: string<CharacterId>(),
  name: string(),
});

export const CharacterRenamedResponse = object({
  characterId: string<CharacterId>(),
  name: string(),
});

export const CharacterSpawn = object({
  characterId: string<CharacterId>(),
  inventoryId: string<InventoryId>(),
  coords: TileVector,
});

export const characterEvents = [
  JoinAsPlayer,
  JoinAsSpectator,
  Leave,
  Respawn,
  Recall,
  RequestFullState,
  ListCharactersRequest,
  CharacterListResponse,
  CreateCharacterRequest,
  CharacterCreatedResponse,
  DeleteCharacterRequest,
  CharacterDeletedResponse,
  RenameCharacterRequest,
  CharacterRenamedResponse,
] as const;
