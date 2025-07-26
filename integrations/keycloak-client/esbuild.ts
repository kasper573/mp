import path from "node:path";
import esbuild from "esbuild";
import builtinModules from "builtin-modules";

const buildOptions: esbuild.BuildOptions = {
  entryPoints: {
    provision: "./src/provision.ts",
  },
  outdir: path.resolve(import.meta.dirname, "dist"),
  bundle: true,
  minify: true,
  platform: "node",
  target: "node22",
  sourcemap: true,
  format: "esm",
  logLevel: "info",
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
    "pino-pretty",
  ],
  mainFields: ["module", "main"],
  // Fix for https://github.com/evanw/esbuild/pull/2067
  banner: {
    js: [
      `import { createRequire as createRequireGlobal } from 'module';`,
      `const require = createRequireGlobal(import.meta.url);`,
    ].join("\n"),
  },
};

void esbuild.build(buildOptions);
