// import { type RouteDefinition } from "@tanstack/solid-router";
// import { lazy } from "solid-js";
// import { env } from "./env";
// import { requireAuth } from "./ui/AuthBoundary";

// export const routes: RouteDefinition[] = [
//   {
//     path: env.auth.callbackPath,
//     component: lazy(() => import("./pages/AuthCallback")),
//   },
//   {
//     path: "/play",
//     component: requireAuth(
//       lazy(() => import("./pages/PlayPage")),
//       lazy(() => import("./pages/PermissionDenied")),
//     ),
//   },
//   { path: "/spring", component: lazy(() => import("./pages/SpringTester")) },
//   { path: "/", component: lazy(() => import("./pages/HomePage")) },
//   { path: "*404", component: lazy(() => import("./pages/NotFound")) },
// ];

export const foo = 123;
