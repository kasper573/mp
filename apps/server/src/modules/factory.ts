import { Factory } from "@mp/network/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import type { ServerContext } from "../context";

const globalRequestLimit = new RateLimiterMemory({
  points: 20,
  duration: 1,
});

export const t = new Factory<ServerContext>({
  async middleware(req, next) {
    const { payload } = req.context.source;

    switch (payload.type) {
      case "server":
        return next(req);
      case "client":
        await globalRequestLimit.consume(payload.clientId);
        return next(req);
    }
  },
});
