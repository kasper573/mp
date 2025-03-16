import { createTRPCHook } from "@mp/solid-trpc";
import type { GameModuleTRPCSlice } from "./trpc.signature";

export const useTRPC = createTRPCHook<GameModuleTRPCSlice>();
