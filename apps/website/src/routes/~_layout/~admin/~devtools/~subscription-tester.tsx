import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/admin/devtools/subscription-tester",
)({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <h1>Subscription Tester</h1>
      <p>
        GraphQL subscriptions have been removed. Game state is now synced via
        rift protocol.
      </p>
    </div>
  );
}
