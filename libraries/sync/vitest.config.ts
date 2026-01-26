import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Force SolidJS to use browser builds instead of server builds
    // This enables reactivity in jsdom test environment
    conditions: ["browser"],
  },
  test: {
    environment: "jsdom",
  },
});
