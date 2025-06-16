import { createFileRoute } from "@tanstack/solid-router";
import { PlayerSpectatorTool } from "@mp/game/client/admin/player-spectator-tool";
import { AuthBoundary } from "../ui/auth-boundary";
import { RoleProtectedRoute } from "../ui/role-protected-route";
import { spectatorRoles } from "@mp/game/server";

export const Route = createFileRoute("/admin/player-spectator")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthBoundary>
      <RoleProtectedRoute requiredRole={spectatorRoles.view}>
        <PlayerSpectatorTool />
      </RoleProtectedRoute>
    </AuthBoundary>
  );
}
