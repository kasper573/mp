import { z, mode, numeric } from "@mp/validate";

const schema = z.object({
  mode: mode.default("development"),
  port: numeric.default(2000),
});

export const env = schema.parse({
  mode: process.env.NODE_ENV,
  port: process.env.WS_PORT,
});
