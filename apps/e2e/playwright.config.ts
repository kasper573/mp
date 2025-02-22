import * as path from "jsr:@std/path";
import { defineConfig, devices } from "npm:@playwright/test";

const baseURL = `https://${Deno.env.get("MP_CLIENT_DOMAIN")}`;
const outputDir = ".playwright"; // Same value should also be defined in .gitignore
const artifactsDir = path.join(outputDir, "artifacts");
const snapshotDir = path.join(outputDir, "snapshots");
const reportDir = path.join(outputDir, "report");
const ignoreHTTPSErrors = true;

const isCI = !!Deno.env.get("CI");

const htmlReporter = [
  "html",
  { outputFolder: reportDir, open: "never" },
] as const;

export default defineConfig({
  outputDir: artifactsDir,
  snapshotDir,
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [htmlReporter, ["github"]] : [htmlReporter],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
