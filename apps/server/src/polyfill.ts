// This file is required to make @excaliburjs/plugin-tiled able to initialize in node.js.
// The package doesn't actually need to need self/window for anything, but the variables must exist.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).self = global;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).window = global;
