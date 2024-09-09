import type { ServerContext } from "../context";
import type { CharacterId } from "../package";
import { tokenHeaderName } from "../serialization";

// TODO implement per-procedure middleware support and use it here
export async function auth({
  clients,
  clientId,
  headers,
  authClient,
  logger,
}: ServerContext): Promise<CharacterId> {
  if (!clientId) {
    throw new Error("Cannot authenticate client without clientId");
  }
  const characterId = clients.getCharacterId(clientId);
  if (characterId) {
    return characterId;
  }

  const token = headers?.[tokenHeaderName];
  if (!token) {
    throw new Error(`Client ${clientId} provided no auth token`);
  }

  try {
    logger.info("Authenticating client", clientId);
    const { sub } = await authClient.verifyToken(token);
    const characterId = sub as CharacterId;
    logger.info(
      "Successfully authenticated client",
      clientId,
      "as",
      characterId,
    );
    clients.set(clientId, characterId);
    return characterId;
  } catch (error) {
    throw new Error(`Client ${clientId} failed to authenticate`);
  }
}
