import { selectOrCreateCharacterIdForUser } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import { unsafe } from "@mp/validate";
import { ctxDbClient } from "../context";
import { auth } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { getDefaultSpawnPoint } from "./default-spawn-point";

export const myCharacterId = rpc.procedure
  .use(auth())
  .output(unsafe<CharacterId>())
  .query(({ ctx }) =>
    selectOrCreateCharacterIdForUser(ctx.ioc.get(ctxDbClient), ctx.user, () =>
      getDefaultSpawnPoint(ctx.ioc),
    ),
  );
