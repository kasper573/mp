import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { PageNotFound } from "../../routes/page-not-found";
import { routeTree } from "./routeTree.gen";

// Note: With TanStack Solid Router, we don't need to create the router manually.
// The Router component is imported directly in app.tsx and uses routeTree.
// This file is kept for the route tree re-export and type registration.

export { routeTree };

declare module "@tanstack/solid-router" {
  interface Register {
    routeTree: typeof routeTree;
  }
}

// Export default components for router configuration
export const defaultPendingComponent = () => (
  <LoadingSpinner debugDescription="router.defaultPendingComponent" />
);
export const defaultNotFoundComponent = PageNotFound;
export const defaultErrorComponent = ErrorFallback;
