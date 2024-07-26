import { numeric, z } from "@mp/validate";

const schema = z.object({
  port: numeric.default(2567),
  tickInterval: numeric.default(1000 / 60),
});

export const env = schema.parse({
  port: process.env.MP_SERVER_PORT,
  tickInterval: process.env.MP_SERVER_TICK_INTERVAL,
});
