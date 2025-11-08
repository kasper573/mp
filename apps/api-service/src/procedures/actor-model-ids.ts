import { type } from "@mp/validate";
import { ctxDb } from "../context";
import { rpc } from "../integrations/trpc";
import { promiseFromResult } from "@mp/std";

export const actorModelIds = rpc.procedure
  .output(type("string").brand("ActorModelId").array())
  .query(({ ctx }) => {
    const result = ctx.ioc.get(ctxDb).selectAllActorModelIds();
    return promiseFromResult(result);
  });
