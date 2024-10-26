import type { SocketClientId, UserId } from "../../context";
import type { CharacterId } from "./schema";

export class ClientRegistry {
  private entries: ClientEntry[] = [];

  associateClientWithUser(clientId: SocketClientId, userId: UserId) {
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

  deleteClient(clientId: SocketClientId) {
    this.entries = this.entries.filter((entry) => entry.clientId === clientId);
  }

  getCharacterId(clientId: SocketClientId): CharacterId | undefined {
    return this.entries.find((entry) => entry.clientId === clientId)
      ?.characterId;
  }

  getClientIds(): ReadonlySet<SocketClientId> {
    return this.entries.reduce(
      (set, entry) => (entry.clientId ? set.add(entry.clientId) : set),
      new Set<SocketClientId>(),
    );
  }
}

interface ClientEntry {
  clientId?: SocketClientId;
  characterId?: CharacterId;
  userId?: UserId;
}

const emptySet: ReadonlySet<unknown> = new Set();
