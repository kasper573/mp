import { initGraphQLTada } from "gql.tada";
import type { introspection } from "./gql-tada.generated";
import type { Scalars } from "../shared/scalars";

export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: Scalars;
}>();

export type { FragmentOf, ResultOf, VariablesOf } from "gql.tada";
export { readFragment } from "gql.tada";
