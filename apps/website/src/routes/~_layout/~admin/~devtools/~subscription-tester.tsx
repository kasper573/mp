import { graphql, useSubscription } from "@mp/api-service/client";
import { ErrorFallback } from "@mp/ui";
import { createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";

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
      <Show when={error()}>{(err) => <ErrorFallback error={err()} />}</Show>
      <pre>{JSON.stringify(data(), null, 2)}</pre>
    </div>
  );
}

const gql = graphql(`
  subscription SubscriptionTester {
    countdown
  }
`);
