import { Spring } from "@mp/engine";
import { Ticker } from "@mp/graphics";
import { useSignal, effect } from "@mp/state/solid";
import { Range } from "@mp/ui";
import { createFileRoute } from "@tanstack/solid-router";
import { createEffect, onCleanup } from "solid-js";
import { TimeSpan } from "@mp/time";

export const Route = createFileRoute("/_layout/admin/devtools/spring-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const autoFlip = useSignal(false);
  const stiffness = useSignal(200);
  const damping = useSignal(40);
  const mass = useSignal(2);
  const precision = useSignal(1);
  const target = useSignal(0);

  const spring = new Spring(target, () => ({
    stiffness: stiffness.get(),
    damping: damping.get(),
    mass: mass.get(),
    precision: precision.get(),
  }));

  createEffect(() => {
    function update() {
      spring.update(TimeSpan.fromMilliseconds(Ticker.shared.deltaMS));
    }
    Ticker.shared.add(update);
    Ticker.shared.start();
    onCleanup(() => {
      Ticker.shared.remove(update);
      Ticker.shared.stop();
    });
  });

  function flipSpringTarget() {
    target.set(target.get() ? 0 : 100);
  }

  const toggleAutoFlip = () => autoFlip.set(!autoFlip.get());

  effect(() => {
    if (autoFlip.get() && spring.state.get() === "settled") {
      flipSpringTarget();
    }
  });

  return (
    <>
      <h1>Spring Tester</h1>
      <Range
        label="Stiffness"
        min={50}
        max={1000}
        step={1}
        signal={stiffness}
      />
      <Range label="Damping" min={1} max={100} step={1} signal={damping} />
      <Range label="Mass" min={0.1} max={10} step={0.1} signal={mass} />
      <Range
        label="Precision"
        min={0.01}
        max={1}
        step={0.01}
        signal={precision}
      />
      <Range label="Target" min={0} max={100} step={1} signal={target} />

      <button onClick={flipSpringTarget}>Flip Target</button>
      <button onClick={toggleAutoFlip}>
        {autoFlip.get() ? "Disable auto flip" : "Enable auto flip"}
      </button>
      <pre>
        {JSON.stringify(
          {
            value: spring.value.get(),
            state: spring.state.get(),
            velocity: spring.velocity.get(),
          },
          null,
          2,
        )}
      </pre>
      <div
        style={{
          width: "100%",
          height: cubeSize,
          background: "skyblue",
          position: "relative",
        }}
      >
        <div
          style={{
            width: cubeSize,
            height: cubeSize,
            background: "blue",
            position: "absolute",
            left: `calc(${spring.value.get() / 100} * (100% - ${cubeSize}))`,
            top: "0",
          }}
        />
      </div>
    </>
  );
}

const cubeSize = "50px";
