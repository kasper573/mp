import { createRouter } from "@tanstack/react-router";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { PageNotFound } from "../../routes/page-not-found";
import { routeTree } from "./routeTree.gen";

export function createClientRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPendingComponent: () => (
      <LoadingSpinner debugId="router.defaultPendingComponent" />
    ),
    defaultNotFoundComponent: PageNotFound,
    defaultErrorComponent: ErrorFallback,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createClientRouter>;
  }
}
