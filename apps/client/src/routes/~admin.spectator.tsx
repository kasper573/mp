import { createFileRoute } from "@tanstack/solid-router";
import { worldRoles } from "@mp/game/client";
import { AuthBoundary } from "../ui/auth-boundary";

export const Route = createFileRoute("/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [worldRoles.spectate],
  }),
});

function RouteComponent() {
  return <div>Hello "/admin/spectator"!</div>;
}
