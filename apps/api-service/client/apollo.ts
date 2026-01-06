import { InMemoryCache } from "@apollo/client";
import { ApolloClient, ApolloLink } from "@apollo/client";
import { BatchHttpLink } from "@apollo/client/link/batch-http";
import { withScalars } from "apollo-link-scalars";
import { scalars } from "../shared/scalars";
import type { IntrospectionQuery } from "graphql";
import { buildClientSchema, buildSchema } from "graphql";
import { deferredApolloLink } from "./deferred-apollo-link";

export type { ErrorLike as GraphQLError } from "@apollo/client";

export interface GraphQLClientOptions {
  serverUrl: string;
  schema: Resolvable<string | object>;
  fetchOptions?: (init?: RequestInit) => RequestInit;
}

export class GraphQLClient extends ApolloClient {
  constructor(opt: GraphQLClientOptions) {
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

function scalarLink(schemaStringOrIntrospection: string | object): ApolloLink {
  const schema =
    typeof schemaStringOrIntrospection === "string"
      ? buildSchema(schemaStringOrIntrospection)
      : buildClientSchema(schemaStringOrIntrospection as IntrospectionQuery);
  return withScalars({ schema, typesMap: scalars });
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
