import { createFileRoute, Link, Outlet } from "@tanstack/solid-router";
import { systemRoles } from "@mp/game/client";
import { AuthBoundary } from "../../../../ui/auth-boundary";

export const Route = createFileRoute("/_layout/admin/devtools")({
  component: AuthBoundary.wrap(DevtoolsLayout, {
    requiredRoles: [systemRoles.useDevTools],
  }),
});

function DevtoolsLayout() {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "row",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "10px",
          "white-space": "nowrap",
          padding: "20px",
        }}
      >
        <Link to="/admin/devtools/observable-tester">Observable Tester</Link>
        <Link to="/admin/devtools/error-tester">Error Tester</Link>
        <Link to="/admin/devtools/spring-tester">Spring Tester</Link>
      </div>
      <div style={{ flex: 1 }}>
        <Outlet />
      </div>
    </div>
  );
}
