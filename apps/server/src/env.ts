import { z, mode, numeric } from "@mp/validate";

const schema = z.object({
  mode: mode.default("development"),
  wsPort: numeric.default(2000),
  httpPort: numeric.default(4000),
});

export const env = schema.parse({
  mode: process.env.NODE_ENV,
  wsPort: process.env.WS_PORT,
  httpPort: process.env.HTTP_PORT,
});
