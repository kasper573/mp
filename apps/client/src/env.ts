import { mode, z } from "@mp/validate";

const schema = z.object({
  mode: mode.default("development"),
  serverUrl: z.string().default("ws://localhost/server-url-missing"),
});

export const env = schema.parse({
  mode: process.env.NODE_ENV,
  serverUrl: process.env.MP_SERVER_URL,
});
