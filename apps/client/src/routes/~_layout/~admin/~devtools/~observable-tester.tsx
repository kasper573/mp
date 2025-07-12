import { useComputed, useSignal, useSignalEffect } from "@mp/state/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "preact/hooks";

export const Route = createFileRoute(
  "/_layout/admin/devtools/observable-tester",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const [log, setLog] = useState("");
  const base = useSignal(1);
  const multiplier = useSignal(1);
  const product = useComputed(() => base.value * multiplier.value);
  const addLog = (message: string) => {
    setLog((prev) => `${message}\n${prev}`);
  };

  useSignalEffect(() => addLog(`Base changed: ${base.value}`));
  useSignalEffect(() => addLog(`Multiplier changed: ${multiplier.value}`));
  useSignalEffect(() => addLog(`Product changed: ${product.value}`));

  return (
    <>
      <h1>Signal Tester</h1>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "10px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div>
            Base: {base.value} <button onClick={() => base.value--}>-</button>
            <button onClick={() => base.value++}>+</button>
          </div>

          <div>
            Multiplier: {multiplier.value}{" "}
            <button onClick={() => multiplier.value--}>-</button>
            <button onClick={() => multiplier.value++}>+</button>
          </div>

          <pre>Product: {product.value}</pre>
        </div>
        <pre style={{ flex: 1 }}>{log}</pre>
      </div>
    </>
  );
}
