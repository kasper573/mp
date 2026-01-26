import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { skipToken } from "@tanstack/solid-query";
import { createQuery } from "@tanstack/solid-query";
import { useSignal } from "@mp/state/solid";
import { Checkbox, ErrorFallback } from "@mp/ui";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";

export const Route = createFileRoute("/_layout/admin/devtools/error-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const qb = useQueryBuilder();
  const [uiError, setUiError] = createSignal(false);
  const [apiError, setApiError] = createSignal(false);
  const errorBoundary = useSignal(false);

  const query = createQuery(() => ({
    ...qb.queryOptions(gql, apiError() ? void 0 : skipToken),
    throwOnError: errorBoundary.get(),
  }));

  return (
    <div>
      <h1>Error Tester</h1>
      <button onClick={() => setUiError(true)}>Trigger UI error</button>
      <div>
        <button disabled={apiError()} onClick={() => setApiError(true)}>
          Trigger API error
        </button>
        <label>
          <Checkbox signal={errorBoundary} disabled={apiError()} />
          Use error boundary
        </label>
      </div>
      <Show when={!errorBoundary.get() ? query.error : undefined}>
        {(error) => (
          <pre>
            <ErrorFallback error={error()} />
          </pre>
        )}
      </Show>
      <Show when={uiError()}>
        <ForcedError />
      </Show>
    </div>
  );
}

function ForcedError(): never {
  throw new Error("This is a test error that was thrown in the UI");
}

const gql = graphql(`
  query ErrorTester {
    testError
  }
`);
