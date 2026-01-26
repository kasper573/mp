/// <reference path="./global.d.ts" />
// Shim module that exports solid-js browser build with proper types
// This allows us to use the reactive (browser) build of solid-js in Node.js
// instead of the SSR build which has no-op reactivity

// Import types from solid-js (types are the same for both builds)
import type { Accessor } from "solid-js";

// Re-export types
export type { Accessor };

// Import from the browser dist path (typed via global.d.ts)
// This ensures we get the reactive build even in Node.js
export {
  createSignal,
  createEffect,
  createMemo,
  untrack,
  batch,
  onCleanup,
  createRoot,
} from "solid-js/dist/solid";
