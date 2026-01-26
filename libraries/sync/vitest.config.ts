import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Use browser condition to enable solid-js reactivity (not SSR no-op mode)
    conditions: ["browser", "development"],
  },
  test: {
    // Force Node.js to resolve solid-js with browser (reactive) build
    alias: {
      "solid-js/web": "solid-js/web/dist/web.js",
      "solid-js": "solid-js/dist/solid.js",
    },
  },
});
