import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "./src/main.ts",
    provision: "./src/keycloak-provision.ts",
  },
  bundle: true,
  minify: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["pino-pretty"],
});
