import type { RiftClient } from "@rift/core";
import {
  JoinAsPlayer,
  JoinAsSpectator,
  Leave,
  ListCharactersRequest,
  Recall,
  RenameCharacterRequest,
  RequestFullState,
  Respawn,
} from "./events";
import type { CharacterId } from "../identity/ids";

export function respawnCharacter(client: RiftClient): void {
  client.emit({
    type: Respawn,
    data: {},
    source: "local",
    target: "wire",
  });
}

export function recallCharacter(client: RiftClient): void {
  client.emit({
    type: Recall,
    data: {},
    source: "local",
    target: "wire",
  });
}

export function joinAsPlayer(
  client: RiftClient,
  characterId: CharacterId,
): void {
  client.emit({
    type: JoinAsPlayer,
    data: characterId,
    source: "local",
    target: "wire",
  });
}

export function joinAsSpectator(
  client: RiftClient,
  characterId: CharacterId,
): void {
  client.emit({
    type: JoinAsSpectator,
    data: characterId,
    source: "local",
    target: "wire",
  });
}

export function leaveGame(client: RiftClient): void {
  client.emit({
    type: Leave,
    data: {},
    source: "local",
    target: "wire",
  });
}

export function requestCharacterList(client: RiftClient): void {
  client.emit({
    type: ListCharactersRequest,
    data: {},
    source: "local",
    target: "wire",
  });
}

export function renameCharacter(
  client: RiftClient,
  characterId: CharacterId,
  name: string,
): void {
  client.emit({
    type: RenameCharacterRequest,
    data: { characterId, name },
    source: "local",
    target: "wire",
  });
}

export function requestFullState(client: RiftClient): void {
  client.emit({
    type: RequestFullState,
    data: {},
    source: "local",
    target: "wire",
  });
}
