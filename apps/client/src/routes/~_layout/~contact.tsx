import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/contact")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div style={{ padding: "20px" }}>Contact: k573business@gmail.com</div>;
}
