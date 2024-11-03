import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  format: "esm",
  target: "node20",
  entry: { index: "src/main.ts" },
  outExtension: () => ({ js: ".mjs" }),
  // Nothing needs the typesecript declaration files of the server app
  dts: false,
  // Building for production means bundling everything into a docker image,
  // but we don't want to have to do this in development for all changes,
  // so we only do it in production.
  ...(process.env.PROD
    ? {
        noExternal: [/.*/],
        bundle: true,
        splitting: false,
      }
    : {}),
});
