import { createFileRoute, Outlet } from "@tanstack/react-router";
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
