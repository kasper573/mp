import type { ParentComponent } from "solid-js";
import { createMemo } from "solid-js";
import type { GraphQLClient } from "./apollo";
import { QueryBuilder, QueryBuilderContext } from "./tanstack-query";

export * from "./use-map-subscription";

export interface GraphQLClientProviderProps {
  client: GraphQLClient;
}

export const GraphQLClientProvider: ParentComponent<
  GraphQLClientProviderProps
> = (props) => {
  const qb = createMemo(() => new QueryBuilder(props.client));
  return (
    <QueryBuilderContext.Provider value={qb()}>
      {props.children}
    </QueryBuilderContext.Provider>
  );
};
