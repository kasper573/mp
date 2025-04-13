import { createRouter } from "@tanstack/solid-router";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { PageNotFound } from "../../routes/page-not-found";
import { routeTree } from "./routeTree.gen";

export function createClientRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPendingComponent: LoadingSpinner,
    defaultNotFoundComponent: PageNotFound,
    defaultErrorComponent: ErrorFallback,
  });
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof createClientRouter>;
  }
}
