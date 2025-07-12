import { defineConfig } from "vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import preact from "@preact/preset-vite";

const babelPlugins = [
  // esbuild already supports stage 3 decorators, but preact uses babel and not esbuild, so we need this plugin
  ["@babel/plugin-proposal-decorators", { version: "2023-11" }],
];

export default defineConfig({
  esbuild: {
    target: "es2022", // Required for decorators
  },
  plugins: [
    vanillaExtractPlugin(),
    preact({ babel: { plugins: babelPlugins } }),
  ],
});
