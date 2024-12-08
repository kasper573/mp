import { type RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";
import { env } from "./env.ts";

export const routes: RouteDefinition[] = [
  {
    path: env.auth.callbackPath,
    component: lazy(() => import("./pages/AuthCallback")),
  },
  { path: "/play", component: lazy(() => import("./pages/game/GamePage")) },
  { path: "/spring", component: lazy(() => import("./pages/SpringTester")) },
  { path: "/", component: lazy(() => import("./pages/HomePage")) },
  { path: "*404", component: lazy(() => import("./pages/NotFound")) },
];
