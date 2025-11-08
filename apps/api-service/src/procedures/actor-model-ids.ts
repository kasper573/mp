import { ctxDb } from "../context";
import { rpc } from "../integrations/trpc";
import { promiseFromResult } from "@mp/std";
import { actorModelIdType } from "@mp/game-shared";

export const actorModelIds = rpc.procedure
  .output(actorModelIdType.array())
  .query(({ ctx }) => {
    const result = ctx.ioc.get(ctxDb).selectAllActorModelIds();
    return promiseFromResult(result);
  });
