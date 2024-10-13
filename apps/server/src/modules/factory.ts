import { Factory } from "@mp/network/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import type { ServerContext } from "../context";

const globalRequestLimit = new RateLimiterMemory({
  points: 20,
  duration: 1,
});

export const t = new Factory<ServerContext>({
  async middleware(req, next) {
    const { clientId } = req.context;
    if (clientId) {
      try {
        await globalRequestLimit.consume(clientId);
      } catch {
        throw new Error("Rate limit exceeded");
      }
      return next(req);
    } else {
      return next(req);
    }
  },
});
