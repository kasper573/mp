import { defineConfig } from "vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [
    // Rift uses TC39 stage 3 decorators (`@inject` accessor); esbuild can't
    // transpile those down to runtime-compatible code, but SWC can.
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true, tsx: true },
        transform: {
          decoratorVersion: "2022-03",
          decoratorMetadata: true,
          react: { runtime: "automatic", importSource: "preact" },
        },
        target: "es2022",
        keepClassNames: true,
      },
    }),
    vanillaExtractPlugin(),
  ],
  ssr: {
    target: "node",
    noExternal: true,
  },
});
