import { createRouter } from "@tanstack/solid-router";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { PageNotFound } from "../../routes/PageNotFound";
import { routeTree } from "./routeTree.generated";

export function createClientRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPendingComponent: LoadingSpinner,
    defaultNotFoundComponent: PageNotFound,
    defaultErrorComponent: ({ error, reset }) => ErrorFallback(error, reset),
  });
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof createClientRouter>;
  }
}
