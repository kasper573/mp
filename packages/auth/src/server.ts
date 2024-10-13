import type { createClerkClient as createAuthClient } from "@clerk/clerk-sdk-node";


export type AuthClient = ReturnType<typeof createAuthClient>;

export {createClerkClient as createAuthClient} from "@clerk/clerk-sdk-node";