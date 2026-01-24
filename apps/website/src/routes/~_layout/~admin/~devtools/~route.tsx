import { systemRoles } from "@mp/keycloak";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { AuthBoundary } from "../../../../ui/auth-boundary";

export const Route = createFileRoute("/_layout/admin/devtools")({
  component: AuthBoundary.wrap(DevtoolsLayout, {
    requiredRoles: [systemRoles.useDevTools],
  }),
});

function DevtoolsLayout() {
  return (
    <div
      id="devtools-layout"
      style={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        flex: 1,
        padding: "20px",
        gap: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        id="devtools-sidebar"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          whiteSpace: "nowrap",
        }}
      >
        <Link to="/admin/devtools/observable-tester">Signal Tester</Link>
        <Link to="/admin/devtools/storage-tester">Storage Tester</Link>
        <Link to="/admin/devtools/error-tester">Error Tester</Link>
        <Link to="/admin/devtools/spring-tester">Spring Tester</Link>
        <Link to="/admin/devtools/actor-tester">Actor Tester</Link>
        <Link to="/admin/devtools/subscription-tester">
          Subscription Tester
        </Link>
        <Link to="/admin/devtools/tile-renderer-tester">
          Tile Renderer Tester
        </Link>
      </div>
      <div
        id="devtools-content"
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          position: "relative",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
