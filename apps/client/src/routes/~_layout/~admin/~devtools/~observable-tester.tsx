import { observable } from "@mp/state";
import { useObservable } from "@mp/state/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute(
  "/_layout/admin/devtools/observable-tester",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const [log, setLog] = useState("");
  const base = observable(1);
  const multiplier = observable(1);
  const product = base.compose(multiplier).derive(([b, m]) => b * m);
  const baseValue = useObservable(base);
  const multiplierValue = useObservable(multiplier);
  const productValue = useObservable(product);

  const addLog = (message: string) => {
    setLog((prev) => `${message}\n${prev}`);
  };

  useEffect(
    () =>
      base.subscribe((value) => {
        addLog(`Base changed: ${value}`);
      }),
    [],
  );

  useEffect(
    () =>
      multiplier.subscribe((value) => {
        addLog(`Multiplier changed: ${value}`);
      }),
    [],
  );

  useEffect(
    () =>
      product.subscribe((value) => {
        addLog(`Product changed: ${value}`);
      }),
    [],
  );

  return (
    <>
      <h1>Observable Tester</h1>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "10px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div>
            Base: {baseValue}{" "}
            <button onClick={() => base.set(base.get() - 1)}>-</button>
            <button onClick={() => base.set(base.get() + 1)}>+</button>
          </div>

          <div>
            Multiplier: {multiplierValue}{" "}
            <button onClick={() => multiplier.set(multiplier.get() - 1)}>
              -
            </button>
            <button onClick={() => multiplier.set(multiplier.get() + 1)}>
              +
            </button>
          </div>

          <pre>Product: {productValue}</pre>
        </div>
        <pre style={{ flex: 1 }}>{log}</pre>
      </div>
    </>
  );
}
