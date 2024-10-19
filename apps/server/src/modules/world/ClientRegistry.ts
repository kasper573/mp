import type { ClientId } from "../../context";
import type { CharacterId } from "./schema";

export class ClientRegistry {
  private clientsByCharacter = new Map<CharacterId, Set<ClientId>>();
  private charactersByClient = new Map<ClientId, CharacterId>();

  set(clientId: ClientId, characterId: CharacterId) {
    let clients = this.clientsByCharacter.get(characterId);
    if (!clients) {
      clients = new Set();
      this.clientsByCharacter.set(characterId, clients);
    }
    clients.add(clientId);
    this.charactersByClient.set(clientId, characterId);
  }

  delete(clientId: ClientId) {
    this.charactersByClient.delete(clientId);
    for (const clients of this.clientsByCharacter.values()) {
      clients.delete(clientId);
    }
  }

  hasClient(clientId: ClientId): boolean {
    return this.charactersByClient.has(clientId);
  }

  hasCharacter(characterId: CharacterId): boolean {
    return this.clientsByCharacter.has(characterId);
  }

  getClientIds(characterId?: CharacterId): ReadonlySet<ClientId> {
    if (characterId !== undefined) {
      return (
        this.clientsByCharacter.get(characterId) ??
        (emptySet as ReadonlySet<ClientId>)
      );
    }
    return new Set(this.charactersByClient.keys());
  }

  getCharacterId(clientId: ClientId): CharacterId | undefined {
    return this.charactersByClient.get(clientId);
  }
}

const emptySet: ReadonlySet<unknown> = new Set();
