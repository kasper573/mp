import { skipToken, useQuery } from "@mp/query";
import { Checkbox, ErrorFallback } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "preact/hooks";
import { useSignal } from "@mp/state/react";
import { useApi } from "@mp/api/sdk";

export const Route = createFileRoute("/_layout/admin/devtools/error-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const api = useApi();
  const [uiError, setUiError] = useState(false);
  const [apiError, setApiError] = useState(false);
  const errorBoundary = useSignal(false);

  const query = useQuery(
    api.testError.queryOptions(apiError ? void 0 : skipToken, {
      throwOnError: errorBoundary.value,
    }),
  );

  return (
    <div>
      <h1>Error Tester</h1>
      <button onClick={() => setUiError(true)}>Trigger UI error</button>
      <div>
        <button disabled={apiError} onClick={() => setApiError(true)}>
          Trigger API error
        </button>
        <label>
          <Checkbox signal={errorBoundary} disabled={apiError} />
          Use error boundary
        </label>
      </div>
      {!errorBoundary.value && query.error ? (
        <pre>
          <ErrorFallback error={query.error} />
        </pre>
      ) : null}
      {uiError && <ForcedError />}
    </div>
  );
}

function ForcedError() {
  throw new Error("This is a test error that was thrown in the UI");
  return null;
}
