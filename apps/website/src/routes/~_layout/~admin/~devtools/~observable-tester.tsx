import { useComputed, useSignal, useSignalEffect } from "@mp/state/solid";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal } from "solid-js";

export const Route = createFileRoute(
  "/_layout/admin/devtools/observable-tester",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const [log, setLog] = createSignal("");
  const base = useSignal(1);
  const multiplier = useSignal(1);
  const product = useComputed(() => base.get() * multiplier.get());
  const addLog = (message: string) => {
    setLog((prev) => `${message}\n${prev}`);
  };

  useSignalEffect(() => addLog(`Base changed: ${base.get()}`));
  useSignalEffect(() => addLog(`Multiplier changed: ${multiplier.get()}`));
  useSignalEffect(() => addLog(`Product changed: ${product()}`));

  return (
    <>
      <h1>Signal Tester</h1>
      <div
        style={{
          display: "flex",
          "flex-direction": "row",
          gap: "10px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div>
            Base: {base.get()}{" "}
            <button onClick={() => base.set((v) => v - 1)}>-</button>
            <button onClick={() => base.set((v) => v + 1)}>+</button>
          </div>

          <div>
            Multiplier: {multiplier.get()}{" "}
            <button onClick={() => multiplier.set((v) => v - 1)}>-</button>
            <button onClick={() => multiplier.set((v) => v + 1)}>+</button>
          </div>

          <pre>Product: {product()}</pre>
        </div>
        <pre style={{ flex: 1 }}>{log()}</pre>
      </div>
    </>
  );
}
