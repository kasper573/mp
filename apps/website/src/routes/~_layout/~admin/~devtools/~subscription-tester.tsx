import { graphql, useSubscription } from "@mp/api-service/client";
import { ErrorFallback } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/admin/devtools/subscription-tester",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { data, error } = useSubscription(gql);

  return (
    <div>
      <h1>Subscription Tester</h1>
      {error && <ErrorFallback error={error} />}
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

const gql = graphql(`
  subscription SubscriptionTester {
    countdown
  }
`);
