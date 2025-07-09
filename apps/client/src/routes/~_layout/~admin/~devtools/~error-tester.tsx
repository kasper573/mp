import { skipToken } from "@mp/rpc/solid";
import { ErrorFallback } from "@mp/ui";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { useRpc } from "../../../../integrations/rpc";

export const Route = createFileRoute("/_layout/admin/devtools/error-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const rpc = useRpc();
  const [uiError, setUiError] = createSignal(false);
  const [rpcError, setRpcError] = createSignal(false);
  const [errorBoundary, setErrorBoundary] = createSignal(false);

  const query = rpc.system.testError.useQuery(() => ({
    input: rpcError() ? void 0 : skipToken,
    throwOnError: errorBoundary(),
  }));

  return (
    <div>
      <h1>Error Tester</h1>
      <button onClick={() => setUiError(true)}>Trigger UI error</button>
      <div>
        <button disabled={rpcError()} onClick={() => setRpcError(true)}>
          Trigger RPC error
        </button>
        <label>
          <input
            type="checkbox"
            checked={errorBoundary()}
            disabled={rpcError()}
            onChange={(e) => setErrorBoundary(e.currentTarget.checked)}
          />
          Use error boundary
        </label>
      </div>
      <Show when={!errorBoundary() && query.error}>
        <pre>
          <ErrorFallback error={query.error} />
        </pre>
      </Show>
      {uiError() && <ForcedError />}
    </div>
  );
}

function ForcedError() {
  throw new Error("This is a test error that was thrown in the UI");
  return null;
}
