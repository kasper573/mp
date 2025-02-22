import { type RouteDefinition } from "npm:@solidjs/router";
import { lazy } from "npm:solid-js";
import { env } from "./env.ts";
import { requireAuth } from "./ui/AuthBoundary.tsx";

export const routes: RouteDefinition[] = [
  {
    path: env.auth.callbackPath,
    component: lazy(() => import("./pages/AuthCallback.tsx")),
  },
  {
    path: "/play",
    component: requireAuth(
      lazy(() => import("./pages/game/GamePage.tsx")),
      lazy(() => import("./pages/PermissionDenied.tsx")),
    ),
  },
  {
    path: "/spring",
    component: lazy(() => import("./pages/SpringTester.tsx")),
  },
  { path: "/", component: lazy(() => import("./pages/HomePage.tsx")) },
  { path: "*404", component: lazy(() => import("./pages/NotFound.tsx")) },
];
