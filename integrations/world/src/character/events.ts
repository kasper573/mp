import { array, copy, object, string } from "@rift/types";
import type { CharacterId } from "./id";
import type { InventoryId } from "../inventory/components";
import { TileVector } from "../movement/components";

export const CharacterSummary = object({
  id: string<CharacterId>(),
  name: string(),
});

export const JoinAsPlayer = string<CharacterId>();

export const JoinAsSpectator = string<CharacterId>();

export const Leave = object({});

export const Respawn = object({});

export const Recall = object({});

export const RequestFullState = object({});

export const ListCharactersRequest = object({});

export const CharacterListResponse = array(CharacterSummary);

export const CreateCharacterRequest = string();

export const CharacterCreatedResponse = copy(CharacterSummary);

export const DeleteCharacterRequest = string<CharacterId>();

export const CharacterDeletedResponse = string<CharacterId>();

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
  CharacterSpawn,
] as const;
