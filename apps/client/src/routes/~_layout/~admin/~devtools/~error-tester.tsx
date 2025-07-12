import { skipToken } from "@mp/rpc/react";
import { ErrorFallback } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "preact/hooks";
import { useRpc } from "../../../../integrations/rpc";

export const Route = createFileRoute("/_layout/admin/devtools/error-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const rpc = useRpc();
  const [uiError, setUiError] = useState(false);
  const [rpcError, setRpcError] = useState(false);
  const [errorBoundary, setErrorBoundary] = useState(false);

  const query = rpc.system.testError.useQuery({
    input: rpcError ? void 0 : skipToken,
    throwOnError: errorBoundary,
  });

  return (
    <div>
      <h1>Error Tester</h1>
      <button onClick={() => setUiError(true)}>Trigger UI error</button>
      <div>
        <button disabled={rpcError} onClick={() => setRpcError(true)}>
          Trigger RPC error
        </button>
        <label>
          <input
            type="checkbox"
            checked={errorBoundary}
            disabled={rpcError}
            onChange={(e) => setErrorBoundary(e.currentTarget.checked)}
          />
          Use error boundary
        </label>
      </div>
      {!errorBoundary && query.error ? (
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
