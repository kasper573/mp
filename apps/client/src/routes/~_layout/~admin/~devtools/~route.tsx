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
      id="devtools-layout"
      style={{
        display: "flex",
        "flex-direction": "row",
        width: "100%",
        flex: 1,
        padding: "20px",
        gap: "20px",
        "box-sizing": "border-box",
      }}
    >
      <div
        id="devtools-sidebar"
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "10px",
          "white-space": "nowrap",
        }}
      >
        <Link to="/admin/devtools/observable-tester">Observable Tester</Link>
        <Link to="/admin/devtools/storage-tester">Storage Tester</Link>
        <Link to="/admin/devtools/error-tester">Error Tester</Link>
        <Link to="/admin/devtools/spring-tester">Spring Tester</Link>
        <Link to="/admin/devtools/actor-tester">Actor Tester</Link>
      </div>
      <div
        id="devtools-content"
        style={{
          display: "flex",
          "flex-direction": "column",
          flex: 1,
          position: "relative",
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
