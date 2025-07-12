import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/admin/devtools/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div style={{ padding: "20px" }}>
      Select a tool from the sidebar to test various features of the system.
    </div>
  );
}
