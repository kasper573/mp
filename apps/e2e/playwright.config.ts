import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const outputDir = ".playwright"; // Same value should also be defined in .gitignore
const artifactsDir = path.join(outputDir, "artifacts");
const snapshotDir = path.join(outputDir, "snapshots");
const reportDir = path.join(outputDir, "report");

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
    baseURL: `https://${process.env.MP_WEBSITE_DOMAIN}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    ignoreHTTPSErrors: true,
  },

  webServer: process.env.START_WITH_SERVICES
    ? {
        command: "pnpm dev",
        cwd: path.join(__dirname, "../.."),
        url: `https://${process.env.MP_WEBSITE_DOMAIN}`,
        reuseExistingServer: true,
        timeout: 10000,
        stdout: "pipe",
        stderr: "pipe",
        wait: {
          stdout: /game service connected/i,
        },
      }
    : undefined,

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
