import { useContext } from "preact/hooks";
import { createContext } from "preact/compat";
import { GraphQLClient } from "./apollo";

export function useQueryBuilder() {
  return useContext(QueryBuilderContext);
}

export const QueryBuilderContext = createContext(
  new Proxy({} as QueryBuilder, {
    get() {
      throw new Error("You must provide a QueryBuilderContext");
    },
  }),
);

export class QueryBuilder {
  constructor(private client: GraphQLClient) {}
}
