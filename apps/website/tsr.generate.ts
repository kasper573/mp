import { getConfig } from "@tanstack/router-generator";
import { Generator } from "@tanstack/router-generator";

try {
  const generator = new Generator({ config: getConfig(), root: process.cwd() });
  await generator.run();
  process.exit(0);
} catch (err) {
  // oxlint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}
