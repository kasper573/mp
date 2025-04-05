import { createRootRoute, Outlet } from "@tanstack/solid-router";
import Layout from "../ui/Layout";

export const Route = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});
