import { mode, z } from "@mp/validate";

const schema = z.object({
  mode: mode.default("development"),
  serverUrl: z.string().url(),
});

export const env = schema.parse({
  mode: import.meta.env.NODE_ENV,
  serverUrl: import.meta.env.VITE_SERVER_URL,
});
