import type { ClerkOptions } from "@clerk/clerk-sdk-node";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import type { AuthToken, UserId } from "./shared";

export interface NodeAuthClientOptions
  extends Pick<ClerkOptions, "secretKey"> {}

export interface NodeAuthClient {
  verifyToken(token: AuthToken): Promise<{ userId: UserId }>;
}

export function createAuthClient(
  options: NodeAuthClientOptions,
): NodeAuthClient {
  const clerk = createClerkClient(options);
  return {
    async verifyToken(token) {
      const { sub } = await clerk.verifyToken(token);
      return { userId: sub as UserId };
    },
  };
}

export * from "./shared";
