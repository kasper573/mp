import type { UserId } from "@mp/auth/server";
import type { ClientId } from "@mp/sync/server";
import type { CharacterId } from "./schema";

export class ClientRegistry {
  private entries: ClientEntry[] = [];

  associateClientWithUser(clientId: ClientId, userId: UserId) {
    if (!this.entries.some((entry) => entry.clientId)) {
      this.entries.push({ clientId, userId });
    }
  }

  associateUserWithCharacter(userId: UserId, characterId: CharacterId) {
    for (const entry of this.entries) {
      if (entry.userId === userId) {
        entry.characterId = characterId;
        return;
      }
    }

    this.entries.push({ userId, characterId });
  }

  deleteClient(clientId: ClientId) {
    this.entries = this.entries.filter((entry) => entry.clientId === clientId);
  }

  getCharacterId(clientId: ClientId): CharacterId | undefined {
    return this.entries.find((entry) => entry.clientId === clientId)
      ?.characterId;
  }

  getClientIds(): ReadonlySet<ClientId> {
    return this.entries.reduce(
      (set, entry) => (entry.clientId ? set.add(entry.clientId) : set),
      new Set<ClientId>(),
    );
  }

  getCharacterCount() {
    return this.entries.filter((entry) => entry.characterId).length;
  }

  getUserCount() {
    return this.entries.filter((entry) => entry.userId).length;
  }
}

interface ClientEntry {
  clientId?: ClientId;
  characterId?: CharacterId;
  userId?: UserId;
}

const emptySet: ReadonlySet<unknown> = new Set();
