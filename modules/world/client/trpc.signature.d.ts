import { t } from "@mp-modules/trpc/server";
import { areaRouter } from "@mp-modules/area/server";
import { characterRouter, npcRouter } from "../server";

// This is a d.ts file so that we can use function syntax to define the router slice and
// infer a type from it without that function (and subsequent package imports) ending in the client bundle.

export type WorldRouter = ReturnType<typeof defineWorldRPCSlice>;

function defineWorldRPCSlice() {
  return t.router({
    character: characterRouter,
    area: areaRouter,
    npc: npcRouter,
  });
}
