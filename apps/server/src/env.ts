import { z, numeric } from "@mp/validate";

const schema = z.object({
  port: numeric.default(2000),
});

export const env = schema.parse({
  port: process.env.MP_SERVER_PORT,
});
