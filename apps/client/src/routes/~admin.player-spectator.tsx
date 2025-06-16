import { createFileRoute } from "@tanstack/solid-router";
import { spectatorViewRole } from "@mp/game/shared/spectator-roles";
import { PlayerSpectatorTool } from "@mp/game/client";
import { AuthBoundary } from "../ui/auth-boundary";
import { RoleProtectedRoute } from "../ui/role-protected-route";

export const Route = createFileRoute("/admin/player-spectator")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthBoundary>
      <RoleProtectedRoute requiredRole={spectatorViewRole}>
        <PlayerSpectatorTool />
      </RoleProtectedRoute>
    </AuthBoundary>
  );
}
