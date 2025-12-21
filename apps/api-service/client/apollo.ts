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
  schemaUrl: string;
  fetchOptions?: () => RequestInit;
}

export class GraphQLClient extends ApolloClient {
  constructor(opt: GraphQLCLientOptions) {
    const httpLink = new BatchHttpLink({
      uri: opt.serverUrl,
      fetch: (input, init) =>
        fetch(input, mergeRequestInit(init, opt.fetchOptions?.())),
    });

    super({
      link: ApolloLink.from([
        deferredApolloLink(() => scalarLink(opt.schemaUrl)),
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

async function scalarLink(schemaUrl: string): Promise<ApolloLink> {
  const schemaString = await fetch(schemaUrl).then((res) => res.text());
  const schema = buildSchema(schemaString);
  return withScalars({ schema, typesMap });
}

function mergeRequestInit(a?: RequestInit, b?: RequestInit): RequestInit {
  const headers = new Headers(a?.headers);
  const headersB = new Headers(b?.headers);
  for (const [key, value] of headersB) {
    headers.set(key, value);
  }
  return { ...a, ...b, headers };
}
