import { computed, signal } from "@mp/state";
import { createFileRoute } from "@tanstack/solid-router";
import { createEffect, createSignal } from "solid-js";

export const Route = createFileRoute(
  "/_layout/admin/devtools/observable-tester",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const [log, setLog] = createSignal("");
  const base = signal(1);
  const multiplier = signal(1);
  const product = computed(() => base.get() * multiplier.get());

  const addLog = (message: string) => {
    setLog((prev) => `${message}\n${prev}`);
  };

  createEffect(() => {
    addLog(`Base changed: ${base.get()}`);
  });

  createEffect(() => {
    addLog(`Multiplier changed: ${multiplier.get()}`);
  });

  createEffect(() => {
    addLog(`Product changed: ${product.get()}`);
  });

  return (
    <>
      <h1>Observable Tester</h1>
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
            <button onClick={() => base.set(base.get() - 1)}>-</button>
            <button onClick={() => base.set(base.get() + 1)}>+</button>
          </div>

          <div>
            Multiplier: {multiplier.get()}{" "}
            <button onClick={() => multiplier.set(multiplier.get() - 1)}>
              -
            </button>
            <button onClick={() => multiplier.set(multiplier.get() + 1)}>
              +
            </button>
          </div>

          <pre>Product: {product.get()}</pre>
        </div>
        <pre style={{ flex: 1 }}>{log()}</pre>
      </div>
    </>
  );
}
