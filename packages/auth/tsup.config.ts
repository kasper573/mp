import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  entry: {
    client: "src/client.tsx",
    server: "src/server.ts",
  },
});
