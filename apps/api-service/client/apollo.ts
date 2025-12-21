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
  schema: Resolvable<string>;
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
        deferredApolloLink(() => resolve(opt.schema).then(scalarLink)),
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

type Eventual<T> = T | Promise<T>;
type Resolvable<T> = Eventual<T> | (() => Eventual<T>);

// oxlint-disable-next-line require-await
async function resolve<T>(r: Resolvable<T>): Promise<T> {
  if (typeof r === "function") {
    return (r as () => Eventual<T>)();
  }
  return r;
}
