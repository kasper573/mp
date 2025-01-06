import type { UserId } from "@mp/auth-server";
import type { ClientId } from "@mp/sync/server";

export class ClientRegistry {
  private map = new Map<ClientId, UserId>();

  associateClientWithUser(clientId: ClientId, userId: UserId) {
    this.map.set(clientId, userId);
  }

  deleteClient(clientId: ClientId) {
    this.map.delete(clientId);
  }

  getClientIds(): ReadonlySet<ClientId> {
    return new Set(this.map.keys());
  }

  getUserCount() {
    return this.map.size;
  }

  getUserId(clientId: ClientId): UserId | undefined {
    return this.map.get(clientId);
  }
}
