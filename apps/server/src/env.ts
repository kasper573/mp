import { numeric, z } from "@mp/validate";

const schema = z.object({
  port: numeric.default(2567),
});

export const env = schema.parse({
  port: process.env.MP_SERVER_PORT,
});
