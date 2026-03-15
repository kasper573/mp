import { build as rolldownBuild } from "rolldown";
import { esmExternalRequirePlugin } from "rolldown/plugins";
import builtinModules from "builtin-modules";

export async function build(opt: {
  entryPoints: Record<string, string>;
  outdir: string;
  suppressedWarnings?: string[];
}): Promise<void> {
  await rolldownBuild({
    onLog(level, log, defaultHandler) {
      if (
        level === "warn" &&
        opt.suppressedWarnings?.includes(log.code ?? "")
      ) {
        return;
      }
      defaultHandler(level, log);
    },
    input: opt.entryPoints,
    platform: "node",
    external: [
      ...builtinModules,
      ...builtinModules.map((m) => `node:${m}`),
      // We externalize pino because of its use of __dirname which makes bundlers fail
      // to produce something that runs in esm. We'll install these in the docker image instead.
      "pino",
      "pino-pretty",
      // We externalize graphql because rolldown's lazy CJS init wrapper is incompatible with
      // the opentelemetry ESM hook (import-in-the-middle), which wraps module exports before
      // lazy initialization runs, causing GraphQL class extensions to fail with "undefined".
      // We'll install graphql in the docker image instead.
      "graphql",
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
