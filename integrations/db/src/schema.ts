// This file re-exports the generated EdgeQL query builder
// Run `pnpm generate` to generate the query builder from the EdgeQL schema

// Export the query builder module
// After running `pnpm generate`, this will point to the generated query builder
export * as e from "../dbschema/edgeql-js";

// For now, we'll export empty objects as placeholders until the query builder is generated
// These will be replaced by the actual generated types after running `pnpm generate`
