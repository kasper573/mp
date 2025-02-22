import { type RouteDefinition } from "@solidjs/router";
import { lazy } from "npm:solid-js";
import { env } from "./env.ts";
import { requireAuth } from "./ui/AuthBoundary.ts";

export const routes: RouteDefinition[] = [
  {
    path: env.auth.callbackPath,
    component: lazy(() => import("./pages/AuthCallback")),
  },
  {
    path: "/play",
    component: requireAuth(
      lazy(() => import("./pages/game/GamePage")),
      lazy(() => import("./pages/PermissionDenied")),
    ),
  },
  { path: "/spring", component: lazy(() => import("./pages/SpringTester")) },
  { path: "/", component: lazy(() => import("./pages/HomePage")) },
  { path: "*404", component: lazy(() => import("./pages/NotFound")) },
];
