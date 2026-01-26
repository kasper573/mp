// Ambient module declaration for solid-js browser build
// This allows importing from solid-js/dist/solid with proper types
// Used by @mp/state to import the reactive build in Node.js contexts
declare module "solid-js/dist/solid" {
  export * from "solid-js";
}
