import { createFileRoute } from "@tanstack/react-router";
import { useState } from "preact/hooks";

export const Route = createFileRoute("/_layout/admin/devtools/error-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const [uiError, setUiError] = useState(false);

  return (
    <div>
      <h1>Error Tester</h1>
      <button onClick={() => setUiError(true)}>Trigger UI error</button>
      {uiError && <ForcedError />}
    </div>
  );
}

function ForcedError() {
  throw new Error("This is a test error that was thrown in the UI");
  return null;
}
