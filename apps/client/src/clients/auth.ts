import { AuthClient } from "@mp/auth/client";
import { env } from "../env";

export const authClient = new AuthClient(env.auth.publishableKey);
const loadPromise = authClient.load();

export async function fetchAuthToken(
  authClient: AuthClient,
): Promise<string | undefined> {
  await loadPromise;
  const token = await authClient.session?.getToken();
  return token ?? undefined;
}
