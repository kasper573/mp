import { type } from "@mp/validate";
import { ctxDbClient } from "../context";
import { rpc } from "../integrations/trpc";
import { selectAllActorModelIds } from "@mp/db";

export const actorModelIds = rpc.procedure
  .output(type("string").brand("ActorModelId").array())
  .query(({ ctx }) => selectAllActorModelIds(ctx.ioc.get(ctxDbClient)));
