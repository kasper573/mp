import {
  createRouter as createRouterImpl,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router";
import { lazy } from "react";
import { env } from "./env";
import { ErrorFallback } from "./components/ErrorFallback";

const Layout = lazy(() => import("./components/Layout"));

const rootRoute = createRootRoute({
  // The router dev tools is injected here since it has to be a child of the RouterProvider.
  // (Docs say it should be possible to place it ouside the provider, but there's a bug that prevents that)
  component: () => (
    <>
      <Layout />
      <RouterDevTools />
    </>
  ),
  notFoundComponent: lazy(() => import("./pages/NotFound")),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazy(() => import("./pages/HomePage")),
});

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/play",
  component: lazy(() => import("./pages/game/GamePage")),
});

const routeTree = rootRoute.addChildren([indexRoute, gameRoute]);

export type Router = ReturnType<typeof createRouter>;
export function createRouter() {
  return createRouterImpl({
    routeTree,
    defaultErrorComponent: ErrorFallback,
  });
}

const RouterDevTools =
  env.mode === "production"
    ? () => null
    : lazy(() =>
        import("@tanstack/router-devtools").then((res) => ({
          default: res.TanStackRouterDevtools,
        })),
      );
