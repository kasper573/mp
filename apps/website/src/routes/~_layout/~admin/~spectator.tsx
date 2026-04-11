import { gatewayRoles } from "@mp/keycloak";
import { createFileRoute } from "@tanstack/react-router";
import { AuthBoundary } from "../../../ui/auth-boundary";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [gatewayRoles.spectate],
  }),
});

function RouteComponent() {
  return (
    <div style={{ padding: "32px" }}>
      Spectator mode is temporarily unavailable while the rift transport rewrite
      lands.
    </div>
  );
}
