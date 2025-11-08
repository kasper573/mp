import type { CharacterId } from "@mp/game-shared";
import { unsafe } from "@mp/validate";
import { ctxDb } from "../context";
import { auth } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { getDefaultSpawnPoint } from "./default-spawn-point";
import { promiseFromResult } from "@mp/std";

export const myCharacterId = rpc.procedure
  .use(auth())
  .output(unsafe<CharacterId>())
  .query(({ ctx }) =>
    promiseFromResult(
      ctx.ioc.get(ctxDb).selectOrCreateCharacterIdForUser({
        user: ctx.user,
        getDefaultSpawnPoint: () => getDefaultSpawnPoint(ctx.ioc),
      }),
    ),
  );
