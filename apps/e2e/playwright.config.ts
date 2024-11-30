import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const dockerDir = path.resolve(__dirname, "../../docker");

dotenv.config({
  path: path.resolve(dockerDir, `.env.test`),
});

const baseURL = `https://${process.env.MP_DOMAIN}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `cd ${dockerDir} && DOCKER_COMPOSE_ENV=test docker compose up --no-build`,
    stdout: "pipe",
    stderr: "pipe",
    url: baseURL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
  },
});
