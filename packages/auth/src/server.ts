import { createClerkClient as createAuthClient } from "@clerk/clerk-sdk-node";

export { createAuthClient };
export type AuthClient = ReturnType<typeof createAuthClient>;
