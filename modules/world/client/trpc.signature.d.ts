import { t } from "@mp-modules/trpc/server";
import {
  areaRouterSlice,
  npcRouterSlice,
  characterRouterSlice,
} from "../server";

// This is a d.ts file so that we can use function syntax to define the router slice and
// infer a type from it without that function (and subsequent package imports) ending in the client bundle.

export type WorldRouter = ReturnType<typeof defineWorldRPCSlice>;

function defineWorldRPCSlice() {
  return t.router({
    ...characterRouterSlice,
    ...areaRouterSlice,
    ...npcRouterSlice,
  });
}
