import { defineConfig } from "tsup";

const isProd = !!process.env.PROD;

export default defineConfig({
  format: "cjs",
  clean: true,
  dts: false, // Nothing needs the typesecript declaration files of the server app
  sourcemap: true,
  target: "node20",
  platform: "node",
  entry: {
    index: "src/main.ts",
  },
  bundle: true,
  minify: isProd,
  splitting: false,
  external: ["stream"],
  noExternal: isProd ? [/.*/] : [/^@mp\//], // Only bundle internal packages in development
});
