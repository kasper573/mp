import type { ActorModelId } from "@mp/db/types";
import { type } from "@mp/validate";
import { rpc } from "../integrations/trpc";

export const actorModelIds = rpc.procedure
  .output(type("string").brand("ActorModelId").array())
  .query(() => {
    // TODO should be in database
    return ["adventurer"] as ActorModelId[];
  });
