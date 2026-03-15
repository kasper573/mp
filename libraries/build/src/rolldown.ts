import { build as rolldownBuild } from "rolldown";
import { esmExternalRequirePlugin } from "rolldown/plugins";
import builtinModules from "builtin-modules";

export async function build(opt: {
  entryPoints: Record<string, string>;
  outdir: string;
}): Promise<void> {
  await rolldownBuild({
    input: opt.entryPoints,
    platform: "node",
    external: [
      ...builtinModules,
      ...builtinModules.map((m) => `node:${m}`),
      // We externalize pino because of its use of __dirname which makes bundlers fail
      // to produce something that runs in esm. We'll install these in the docker image instead.
      "pino",
      "pino-pretty",
    ],
    resolve: {
      mainFields: ["module", "main"],
    },
    transform: {
      target: "node22",
    },
    plugins: [esmExternalRequirePlugin()],
    output: {
      dir: opt.outdir,
      format: "esm",
      sourcemap: true,
      minify: true,
    },
  });
}
