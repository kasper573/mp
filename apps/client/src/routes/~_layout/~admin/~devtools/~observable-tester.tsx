import { observable } from "@mp/state";
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
  const base = observable(1);
  const multiplier = observable(1);
  const product = base.compose(multiplier).derive(([b, m]) => b * m);
  const [baseValue, multiplierValue, productValue] = useObservables(
    base,
    multiplier,
    product,
  );

  const addLog = (message: string) => {
    setLog((prev) => `${message}\n${prev}`);
  };

  onCleanup(
    base.subscribe((value) => {
      addLog(`Base changed: ${value}`);
    }),
  );

  onCleanup(
    multiplier.subscribe((value) => {
      addLog(`Multiplier changed: ${value}`);
    }),
  );

  onCleanup(
    product.subscribe((value) => {
      addLog(`Product changed: ${value}`);
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
