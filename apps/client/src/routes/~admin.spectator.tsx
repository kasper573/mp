import { createFileRoute } from "@tanstack/solid-router";
import { SpectatorClient, worldRoles } from "@mp/game/client";
import { AuthBoundary } from "../ui/auth-boundary";

export const Route = createFileRoute("/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [worldRoles.spectate],
  }),
});

function RouteComponent() {
  return (
    <div style={{ padding: "32px" }}>
      <SpectatorClient />
    </div>
  );
}
