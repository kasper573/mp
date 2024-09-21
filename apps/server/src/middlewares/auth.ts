import type { ServerContext } from "../context";
import type { CharacterId } from "../package";
import { tokenHeaderName } from "../serialization";

export async function auth({
  clients,
  clientId,
  headers,
  auth,
}: ServerContext): Promise<CharacterId> {
  if (!clientId) {
    throw new Error("Cannot authenticate client without clientId");
  }

  const token = headers?.[tokenHeaderName];
  if (!token) {
    throw new Error(`Client ${clientId} provided no auth token`);
  }

  try {
    const { sub } = await auth.verifyToken(token);
    const characterId = sub as CharacterId;
    clients.set(clientId, characterId);
    return characterId;
  } catch (error) {
    throw new Error(
      `Client ${clientId} failed to authenticate: ${String(error)}`,
    );
  }
}
