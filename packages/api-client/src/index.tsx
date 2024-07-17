import type { ServerRouter, ServerContext } from "@mp/server";

export type * from "@mp/server";

export interface ApiClientOptions {
  url: string;
  context: () => ServerContext;
}

export function createApiClient({
  url,
  context,
}: ApiClientOptions): ApiClient<ServerRouter> {
  return {};
}

export interface ApiClient<T> {}
