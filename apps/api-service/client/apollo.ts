import { InMemoryCache } from "@apollo/client";
import { ApolloClient, ApolloLink } from "@apollo/client";
import { BatchHttpLink } from "@apollo/client/link/batch-http";
import { withScalars } from "apollo-link-scalars";
import { typesMap } from "../shared/scalars";
import { buildSchema } from "graphql";
import { deferredApolloLink } from "./deferred-apollo-link";

export type { ErrorLike as GraphQLError } from "@apollo/client";

export interface GraphQLCLientOptions {
  serverUrl: string;
  getSchema: () => Promise<string>;
  fetchOptions?: (init?: RequestInit) => RequestInit;
}

export class GraphQLClient extends ApolloClient {
  constructor(opt: GraphQLCLientOptions) {
    const httpLink = new BatchHttpLink({
      uri: opt.serverUrl,
      batchInterval: 100,
      batchDebounce: true,
      fetch: (input, init) => fetch(input, opt.fetchOptions?.(init) ?? init),
    });

    super({
      link: ApolloLink.from([
        deferredApolloLink(() => opt.getSchema().then(scalarLink)),
        httpLink,
      ]),

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

function scalarLink(schemaString: string): ApolloLink {
  const schema = buildSchema(schemaString);
  return withScalars({ schema, typesMap });
}
