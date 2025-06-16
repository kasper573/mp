import { createFileRoute } from "@tanstack/solid-router";
import { PlayerSpectatorTool } from "../ui/admin/player-spectator-tool";
import { AuthBoundary } from "../ui/auth-boundary";
import { RoleProtectedRoute } from "../ui/role-protected-route";

export const Route = createFileRoute("/admin/player-spectator")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthBoundary>
      <RoleProtectedRoute requiredRole="spectator.view">
        <PlayerSpectatorTool />
      </RoleProtectedRoute>
    </AuthBoundary>
  );
}
