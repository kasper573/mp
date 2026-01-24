import { InMemoryCache } from "@apollo/client";
import { ApolloClient, ApolloLink } from "@apollo/client";
import { BatchHttpLink } from "@apollo/client/link/batch-http";
import { withScalars } from "apollo-link-scalars";
import { scalars } from "../shared/scalars";
import type { GraphQLWSConnectionParams } from "../shared/ws";
import type { IntrospectionQuery } from "graphql";
import { buildClientSchema, buildSchema, OperationTypeNode } from "graphql";
import { deferredApolloLink } from "./deferred-apollo-link";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import type { AccessToken } from "@mp/auth";

export type { ErrorLike as GraphQLError } from "@apollo/client";

// We use this hook from apollo client because tanstack query has no concept of subscriptions.
export { useSubscription } from "@apollo/client/react";

export interface GraphQLClientOptions {
  url: string;
  subscriptionsUrl?: string;
  schema: Resolvable<string | object>;
  fetchOptions?: (init?: RequestInit) => RequestInit;
  getAccessToken?: () => AccessToken | undefined;
}

export class GraphQLClient extends ApolloClient {
  constructor(opt: GraphQLClientOptions) {
    const httpLink = new BatchHttpLink({
      uri: opt.url,
      batchInterval: 100,
      batchDebounce: true,
      fetch: (input, init) => {
        const token = opt.getAccessToken?.();
        const headers = new Headers(init?.headers);
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return fetch(input, opt.fetchOptions?.(init) ?? init);
      },
    });

    const scalarLink = deferredApolloLink(() =>
      resolve(opt.schema).then(createScalarLink),
    );

    let link: ApolloLink;
    if (opt.subscriptionsUrl) {
      const wsLink = new GraphQLWsLink(
        createClient({
          url: opt.subscriptionsUrl,
          lazy: true,
          connectionParams(): GraphQLWSConnectionParams | undefined {
            const accessToken = opt.getAccessToken?.();
            return accessToken ? { accessToken } : undefined;
          },
        }),
      );
      link = ApolloLink.split(
        ({ operationType }) => operationType === OperationTypeNode.SUBSCRIPTION,
        ApolloLink.from([scalarLink, wsLink]),
        ApolloLink.from([scalarLink, httpLink]),
      );
    } else {
      link = ApolloLink.from([scalarLink, httpLink]);
    }

    super({
      link,
      cache: new InMemoryCache(), // Disable caching because we're going to let @tanstack/react-query handle caching
      defaultOptions: {
        watchQuery: { fetchPolicy: "no-cache" },
        query: { fetchPolicy: "no-cache" },
        mutate: { fetchPolicy: "no-cache" },
      },
    });
  }
}

function createScalarLink(
  schemaStringOrIntrospection: string | object,
): ApolloLink {
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
