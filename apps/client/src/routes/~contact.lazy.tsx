import { createLazyFileRoute } from "@tanstack/solid-router";

export const Route = createLazyFileRoute("/contact")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div style={{ padding: "20px" }}>Contact: admin@k573.dev</div>;
}
