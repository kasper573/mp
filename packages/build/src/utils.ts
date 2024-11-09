import * as fs from "node:fs";
import path from "node:path";

export function inferInternalPackages(projectRoot: string): string[] {
  const packageJsonString = fs.readFileSync(
    path.resolve(projectRoot, "package.json"),
    "utf8",
  );

  const packageJson = JSON.parse(packageJsonString) as Record<string, unknown>;
  const internalPackages: string[] = [];
  const { dependencies, devDependencies, peerDependencies } = packageJson;
  for (const deps of [dependencies, devDependencies, peerDependencies]) {
    for (const [packageName, packageVersion] of Object.entries(deps ?? {})) {
      if (
        String(packageVersion).startsWith("workspace:") &&
        !internalPackages.includes(packageName)
      ) {
        internalPackages.push(packageName);
      }
    }
  }
  return internalPackages;
}
