import path from "node:path";
import { build, type Plugin } from "@mp/build/esbuild";

// Exists to disable vanilla extract css on the server.
// Must be done since the world package contains both FE and BE code.
// The FE code in practice never runs on the server, but must be importable.
const stubCssTs: Plugin = {
  name: "stub-css-ts",
  setup(build) {
    build.onLoad({ filter: /\.css\.ts$/ }, () => ({
      contents: "",
      loader: "js",
    }));
  },
};

void build({
  entryPoints: {
    index: "./src/main.ts",
  },
  outdir: path.resolve(import.meta.dirname, "dist"),
  plugins: [stubCssTs],
});
