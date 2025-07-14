import path from "node:path";
import esbuild from "esbuild";
import builtinModules from "builtin-modules";
import { vanillaExtractPlugin } from "@vanilla-extract/esbuild-plugin";

const buildOptions: esbuild.BuildOptions = {
  entryPoints: {
    index: "./src/main.ts",
    provision: "./src/keycloak-provision.ts",
  },
  outdir: path.resolve(import.meta.dirname, "dist"),
  bundle: true,
  minify: true,
  platform: "node",
  target: "node22",
  sourcemap: true,
  format: "esm",
  logLevel: "info",
  external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  mainFields: ["module", "main"],
  // Fix for https://github.com/evanw/esbuild/pull/2067
  banner: {
    js: [
      `import { createRequire as createRequireGlobal } from 'module';`,
      `const require = createRequireGlobal(import.meta.url);`,
    ].join("\n"),
  },
  plugins: [
    vanillaExtractPlugin({
      // We only need to be able to transpile vanilla extract.
      // The server isn't interested in the output css files.
      outputCss: false,
    }),
  ],
};

void esbuild.build(buildOptions);
