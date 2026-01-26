import { graphql } from "@mp/api-service/client";
import { useSubscription } from "@mp/api-service/client/solid";
import { ErrorFallback } from "@mp/ui";
import { createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";

export const Route = createFileRoute(
  "/_layout/admin/devtools/subscription-tester",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const result = useSubscription(gql);

  return (
    <div>
      <h1>Subscription Tester</h1>
      <Show when={result.error}>
        {(error) => <ErrorFallback error={error()} />}
      </Show>
      <pre>{JSON.stringify(result.data, null, 2)}</pre>
    </div>
  );
}

const gql = graphql(`
  subscription SubscriptionTester {
    countdown
  }
`);
