import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  entry: {
    client: "src/client.ts",
    server: "src/server.ts",
  },
});
