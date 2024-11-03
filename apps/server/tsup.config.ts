import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  entry: { index: "src/main.ts" },
  // Nothing needs the typesecript declaration files of the server app
  dts: false,
  // Building for production means bundling everything into a docker image,
  // but we don't want to have to do this in development for all changes,
  // so we only do it in production.
  ...(process.env.PROD
    ? {
        outExtension: () => ({ js: `.js` }),
        noExternal: [/.*/],
        format: "cjs",
        target: "node20",
        bundle: true,
        splitting: false,
      }
    : {}),
});
