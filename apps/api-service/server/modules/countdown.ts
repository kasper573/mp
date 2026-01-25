import type { Int } from "grats";
import { auth } from "../integrations/auth";
import type { ApiContext } from "../context";
import { ctxLogger } from "../context";

/** @gqlSubscriptionField */
export async function* countdown(ctx: ApiContext): AsyncIterable<Int> {
  const logger = ctx.ioc.get(ctxLogger);
  const res = await auth(ctx);
  logger.info(`${res.user.name} started countdown`);
  for (let i = 10; i >= 0; i--) {
    logger.info(`${res.user.name} countdown at ${i}`);
    // oxlint-disable-next-line no-await-in-loop
    await sleep(1);
    yield i;
  }
}

function sleep(s: number) {
  return new Promise((resolve) => setTimeout(resolve, s * 1000));
}
