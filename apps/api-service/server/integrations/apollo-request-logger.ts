// oxlint-disable require-await
import type { ApolloServerPlugin } from "@apollo/server";
import type { ApiContext } from "../context";
import { ctxLogger } from "../context";

export function apolloRequestLoggerPlugin(): ApolloServerPlugin<ApiContext> {
  return {
    async requestDidStart({
      contextValue: { ioc },
      request: { http: _, ...request },
    }) {
      const logger = ioc.get(ctxLogger);
      logger.info(request, "GraphQL request received");
      return {
        async didEncounterErrors({ errors }) {
          for (const error of errors) {
            logger.error(
              new Error(
                `GraphQL resolver "${(error.path ?? []).join(".")}" threw an error`,
                { cause: error.originalError ?? error },
              ),
            );
          }
        },
      };
    },
  };
}
