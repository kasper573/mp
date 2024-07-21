import { z, numeric } from "@mp/validate";

const schema = z.object({
  port: numeric.default(2000),
  tickInterval: numeric.default(500),
});

export const env = schema.parse({
  port: process.env.MP_SERVER_PORT,
  tickInterval: process.env.MP_SERVER_TICK_INTERVAL,
});
