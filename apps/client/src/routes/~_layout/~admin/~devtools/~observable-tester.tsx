import { computed, effect, signal } from "@mp/state";
import { useObservables } from "@mp/state/solid";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, onCleanup } from "solid-js";

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
  const [baseValue, multiplierValue, productValue] = useObservables(
    base,
    multiplier,
    product,
  );

  const addLog = (message: string) => {
    setLog((prev) => `${message}\n${prev}`);
  };

  onCleanup(
    effect(() => {
      addLog(`Base changed: ${base.get()}`);
    }),
  );

  onCleanup(
    effect(() => {
      addLog(`Multiplier changed: ${multiplier.get()}`);
    }),
  );

  onCleanup(
    effect(() => {
      addLog(`Product changed: ${product.get()}`);
    }),
  );

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
            Base: {baseValue()}{" "}
            <button onClick={() => base.set(base.get() - 1)}>-</button>
            <button onClick={() => base.set(base.get() + 1)}>+</button>
          </div>

          <div>
            Multiplier: {multiplierValue()}{" "}
            <button onClick={() => multiplier.set(multiplier.get() - 1)}>
              -
            </button>
            <button onClick={() => multiplier.set(multiplier.get() + 1)}>
              +
            </button>
          </div>

          <pre>Product: {productValue()}</pre>
        </div>
        <pre style={{ flex: 1 }}>{log()}</pre>
      </div>
    </>
  );
}
