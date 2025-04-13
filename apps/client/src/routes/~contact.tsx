import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/contact")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div style={{ padding: "20px" }}>Contact: k573business@gmail.com</div>;
}
