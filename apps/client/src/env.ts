import { mode, z } from "@mp/validate";

const schema = z.object({
  mode: mode.default("development"),
  serverUrl: z.string().url(),
});

export const env = schema.parse({
  mode: process.env.NODE_ENV,
  serverUrl: process.env.SERVER_URL,
});
