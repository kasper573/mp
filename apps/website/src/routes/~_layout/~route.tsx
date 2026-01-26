import { createFileRoute, Outlet } from "@tanstack/solid-router";
import Layout from "../../ui/layout";

export const Route = createFileRoute("/_layout")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
