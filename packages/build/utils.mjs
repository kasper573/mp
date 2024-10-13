import * as fs from "node:fs";
import path from "node:path";

/**
 * @param {string} projectRoot
 * @returns {string[]}
 */
export function inferInternalPackages(projectRoot) {
  const packageJsonString = fs.readFileSync(
    path.resolve(projectRoot, "package.json"),
    "utf8",
  );
  /**
   * @type {unknown}
   */
  const packageJson = JSON.parse(packageJsonString);
  const internalPackages = [];
  const { dependencies, devDependencies, peerDependencies } = packageJson;
  for (const deps of [dependencies, devDependencies, peerDependencies]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
