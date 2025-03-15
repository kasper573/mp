import { t } from "@mp-modules/trpc/server";
import { createTRPCHook } from "@mp/solid-trpc";
import { areaRouter } from "@mp-modules/area/server";
import { characterRouter, npcRouter } from "../server";

export const useTRPC = createTRPCHook<WorldRouter>();

export type WorldRouter = ReturnType<typeof defineWorldRPCSlice>;

function defineWorldRPCSlice() {
  return t.router({
    character: characterRouter,
    area: areaRouter,
    npc: npcRouter,
  });
}
