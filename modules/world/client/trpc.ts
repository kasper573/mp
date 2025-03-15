import { createTRPCHook } from "@mp/solid-trpc";
import type { WorldRouter } from "./trpc.signature";

export const useTRPC = createTRPCHook<WorldRouter>();
