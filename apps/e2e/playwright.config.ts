import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const dockerDir = path.resolve(__dirname, "../../docker");

const baseURL = `https://${process.env.MP_CLIENT_DOMAIN}`;
const outputDir = ".playwright"; // Same value should also be defined in .gitignore
const artifactsDir = path.join(outputDir, "artifacts");
const snapshotDir = path.join(outputDir, "snapshots");
const reportDir = path.join(outputDir, "report");
const ignoreHTTPSErrors = true;

const htmlReporter = [
  "html",
  { outputFolder: reportDir, open: "never" },
] as const;

export default defineConfig({
  outputDir: artifactsDir,
  snapshotDir,
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [htmlReporter, ["github"]] : [htmlReporter],
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

  webServer: {
    command: `cd ${dockerDir} && ./dockerctl.sh test up --no-build`,
    stdout: "ignore",
    stderr: "ignore",
    url: baseURL,
    ignoreHTTPSErrors,
    reuseExistingServer: !process.env.CI,
  },
});
