import { createFileRoute, Outlet } from "@tanstack/solid-router";
import { systemRoles } from "@mp/game/client";
import { AuthBoundary } from "../../../../ui/auth-boundary";

export const Route = createFileRoute("/_layout/admin/devtools")({
  component: AuthBoundary.wrap(Outlet, {
    requiredRoles: [systemRoles.useDevTools],
  }),
});
