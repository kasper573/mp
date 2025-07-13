import { FrameEmitter, Spring } from "@mp/engine";
import { useSignal, useSignalEffect } from "@mp/state/react";
import { Range } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "preact/hooks";

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

  const frameEmitter = useMemo(() => new FrameEmitter(), []);
  const spring = useMemo(
    () =>
      new Spring(target, () => ({
        stiffness: stiffness.value,
        damping: damping.value,
        mass: mass.value,
        precision: precision.value,
      })),
    [target, stiffness, damping, mass, precision],
  );

  useEffect(() => {
    const unsub = frameEmitter.subscribe((opt) =>
      spring.update(opt.timeSinceLastFrame),
    );
    frameEmitter.start();
    return () => {
      unsub();
      frameEmitter.stop();
    };
  }, [frameEmitter, spring]);

  function flipSpringTarget() {
    target.value = target.value ? 0 : 100;
  }

  const toggleAutoFlip = () => (autoFlip.value = !autoFlip.value);

  useSignalEffect(() => {
    if (autoFlip.value && spring.state.value === "settled") {
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
        {autoFlip.value ? "Disable auto flip" : "Enable auto flip"}
      </button>
      <pre>
        {JSON.stringify(
          {
            value: spring.value.value,
            state: spring.state.value,
            velocity: spring.velocity.value,
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
            left: `calc(${spring.value.value / 100} * (100% - ${cubeSize}))`,
            top: 0,
          }}
        />
      </div>
    </>
  );
}

const cubeSize = "50px";
