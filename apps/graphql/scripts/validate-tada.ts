import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { glob } from "glob";
import ts from "typescript";
import Bottleneck from "bottleneck";
import { fileURLToPath } from "node:url";

// This is script is monorepo support for running `gql.tada check`
// for all packages in the repo using gql.tada/ts-plugin.
// If monorepo support is fixed upstream we can remove this.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const thisPackageDir = path.resolve(dirname, "..");
const rootDir = path.resolve(thisPackageDir, "..", "..");
const filter = process.argv[2];

const limiter = new Bottleneck({
  maxConcurrent: 4,
});

let configs = await findTsConfigs(rootDir);

if (filter) {
  configs = configs.filter((p) =>
    p.toLowerCase().includes(filter.toLowerCase()),
  );
}

const results = await Promise.allSettled(
  configs.map((configPath) =>
    limiter.schedule(() => validateGraphQL(configPath)),
  ),
);

const failures = results.filter(
  (r): r is PromiseRejectedResult => r.status === "rejected",
);

process.exit(failures.length);

async function findTsConfigs(directory: string): Promise<string[]> {
  return glob("**/tsconfig.json", {
    cwd: directory,
    absolute: true,
    ignore: ["**/node_modules/**", path.join(thisPackageDir, "**")],
  });
}

function resolveConfig(configPath: string): TsConfig {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const basePath = path.dirname(configPath);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    basePath,
    undefined,
    configPath,
  );

  return {
    compilerOptions: parsed.options as TsConfig["compilerOptions"],
  };
}

function findTadaPlugin(config: TsConfig): TadaPlugin | undefined {
  return config.compilerOptions?.plugins?.find(
    (p) => p.name === "gql.tada/ts-plugin",
  ) as TadaPlugin | undefined;
}

function runTadaCheck(
  cwd: string,
  tsConfigPath: string,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const proc = spawn(
      "pnpm",
      ["exec", "gql.tada", "check", "-w", "-c", tsConfigPath],
      { cwd, stdio: "pipe" },
    );

    proc.stdout.on("data", (data) => stdout.push(data));
    proc.stderr.on("data", (data) => stderr.push(data));

    proc.on("close", (code) => {
      resolve({
        code: code ?? 0,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      });
    });

    proc.on("error", reject);
  });
}

async function validateGraphQL(configPath: string): Promise<void> {
  const dir = path.dirname(configPath);
  const tmpPath = path.join(dir, "tsconfig.tmp.json");
  const tsConfig = resolveConfig(configPath);
  const plugin = findTadaPlugin(tsConfig);
  if (!plugin) {
    return;
  }

  const prefix = path.join(dir, "node_modules/@mp/graphql/client");
  plugin.schema = path.join(prefix, plugin.schema);
  plugin.tadaOutputLocation = path.join(prefix, plugin.tadaOutputLocation);
  fs.writeFileSync(tmpPath, JSON.stringify(tsConfig));

  try {
    const result = await runTadaCheck(dir, tmpPath);

    if (result.code === 0) {
      console.log(configPath);
    } else {
      console.error(`❌ ${configPath}`);
    }

    if (result.stdout) {
      console.log(result.stdout);
    }

    if (result.stderr) {
      console.error(result.stderr);
    }

    if (result.code !== 0) {
      throw new Error(`gql.tada exited with code ${result.code}`);
    }
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
}

interface TadaPlugin {
  schema: string;
  tadaOutputLocation: string;
}

interface TsConfig {
  compilerOptions?: {
    plugins?: Array<{ name: string }>;
  };
}

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}
