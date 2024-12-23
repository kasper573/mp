import esbuild from "esbuild";
import builtinModules from "builtin-modules";

const isWatchMode = process.argv.includes("--watch");
const isProd = !!process.env.PROD;

const buildOptions = {
  entryPoints: ["src/main.ts"],
  outfile: "dist/index.js",
  bundle: true,
  minify: isProd,
  platform: "node",
  target: "node22",
  sourcemap: !isProd,
  format: "esm",
  logLevel: "info",
  loader: {
    ".ts": "ts",
    ".wasm": "file",
  },
  external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  mainFields: ["module", "main"],
  // Fix for https://github.com/evanw/esbuild/pull/2067
  banner: {
    js: [
      `import { createRequire as createRequireGlobal } from 'module';`,
      `const require = createRequireGlobal(import.meta.url);`,
    ].join("\n"),
  },
} satisfies esbuild.BuildOptions;

if (isWatchMode) {
  void esbuild.context(buildOptions).then((ctx) => ctx.watch());
} else {
  void esbuild.build(buildOptions);
}
