import { type RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";
import { env } from "./env.ts";

export const routes: RouteDefinition[] = [
  {
    path: env.auth.callbackPath,
    component: lazy(() => import("./pages/AuthCallback.tsx")),
  },
  { path: "/play", component: lazy(() => import("./pages/game/GamePage.tsx")) },
  { path: "/spring", component: lazy(() => import("./pages/SpringTester.tsx")) },
  { path: "/", component: lazy(() => import("./pages/HomePage.tsx")) },
  { path: "*404", component: lazy(() => import("./pages/NotFound.tsx")) },
];
