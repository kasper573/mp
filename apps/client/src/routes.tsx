import { type RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";

export const routes: RouteDefinition[] = [
  { path: "/play", component: lazy(() => import("./pages/game/GamePage")) },
  { path: "/", component: lazy(() => import("./pages/HomePage")) },
  { path: "*404", component: lazy(() => import("./pages/NotFound")) },
];
