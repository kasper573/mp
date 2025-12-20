import { InMemoryCache } from "@apollo/client";
import { ApolloClient, ApolloLink } from "@apollo/client";
import { BatchHttpLink } from "@apollo/client/link/batch-http";
import { withScalars } from "apollo-link-scalars";
import { typesMap } from "../shared/scalars";
import { buildSchema } from "graphql";
import graphqlSchemaStringg from "../generated/schema.graphql?raw";

export class GraphQLClient extends ApolloClient {
  constructor(uri: string, fetchOptions?: () => RequestInit) {
    const httpLink = new BatchHttpLink({
      uri,
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          ...fetchOptions?.(),
        }),
    });

    const schema = buildSchema(graphqlSchemaStringg);
    const scalarLink = withScalars({ schema, typesMap });

    super({
      link: ApolloLink.from([scalarLink, httpLink]),

      // Disable caching because we're going to let @tanstack/react-query handle caching
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: { fetchPolicy: "no-cache" },
        query: { fetchPolicy: "no-cache" },
        mutate: { fetchPolicy: "no-cache" },
      },
    });
  }
}
