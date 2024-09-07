import * as fs from "fs";
import * as path from "path";

/**
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function inferInternalPackages(projectRoot) {
  const packageJsonString = fs.readFileSync(
    path.resolve(projectRoot, "package.json"),
    "utf-8",
  );
  const packageJson = JSON.parse(packageJsonString) as Record<string, unknown>;
  const internalPackages = [];
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
