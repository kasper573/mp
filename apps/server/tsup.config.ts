import { defineConfig } from "tsup";

const isProd = !!process.env.PROD;

export default defineConfig({
  format: "esm",
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
  noExternal: isProd ? [/.*/] : [/^@mp\//], // Only bundle internal packages in development
  // Fix for https://github.com/evanw/esbuild/pull/2067
  banner: {
    js: [
      `import { createRequire as createRequireGlobal } from 'module';`,
      `const require = createRequireGlobal(import.meta.url);`,
    ].join("\n"),
  },
});
