import { FrameEmitter, Spring } from "@mp/engine";
import { observable } from "@mp/state";
import { useObservable } from "@mp/state/solid";
import { TimeSpan } from "@mp/time";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, createMemo, createEffect, onCleanup } from "solid-js";

export const Route = createFileRoute("/_layout/admin/devtools/spring-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const [autoFlip, setAutoFlip] = createSignal(false);
  const [stiffness, setStiffness] = createSignal(200);
  const [damping, setDamping] = createSignal(40);
  const [mass, setMass] = createSignal(2);
  const [precision, setPrecision] = createSignal(1);
  const target = observable(0);
  const targetValue = useObservable(target);
  const options = createMemo(() => ({
    stiffness: stiffness(),
    damping: damping(),
    mass: mass(),
    precision: precision(),
  }));

  const frameEmitter = new FrameEmitter();
  const spring = new Spring(target, options);
  const springState = useObservable(spring.state);
  const springVelocity = useObservable(spring.velocity);
  const springValue = useObservable(spring.value);

  createEffect(() => {
    if (springState() === "moving") {
      onCleanup(
        frameEmitter.subscribe((opt) => spring.update(opt.timeSinceLastFrame)),
      );
    }
  });

  createRenderEffect(spring.update);

  function flipSpringTarget() {
    target.set(target.get() ? 0 : 100);
  }

  const toggleAutoFlip = () => setAutoFlip((now) => !now);

  createEffect(() => {
    if (autoFlip() && springState() === "settled") {
      flipSpringTarget();
    }
  });

  onCleanup(frameEmitter.start());

  return (
    <>
      <h1>Spring Tester</h1>
      <Range
        label="Stiffness"
        min={50}
        max={1000}
        step={1}
        value={stiffness()}
        onChange={setStiffness}
      />
      <Range
        label="Damping"
        min={1}
        max={100}
        step={1}
        value={damping()}
        onChange={setDamping}
      />
      <Range
        label="Mass"
        min={0.1}
        max={10}
        step={0.1}
        value={mass()}
        onChange={setMass}
      />
      <Range
        label="Precision"
        min={0.01}
        max={1}
        step={0.01}
        value={precision()}
        onChange={setPrecision}
      />
      <Range
        label="Target"
        min={0}
        max={100}
        step={1}
        value={targetValue()}
        onChange={(value) => target.set(value)}
      />

      <button onClick={flipSpringTarget}>Flip Target</button>
      <button onClick={toggleAutoFlip}>
        {autoFlip() ? "Disable auto flip" : "Enable auto flip"}
      </button>
      <pre>
        {JSON.stringify(
          {
            value: springValue(),
            state: springState(),
            velocity: springVelocity(),
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
            left: `calc(${springValue() / 100} * (100% - ${cubeSize}))`,
            top: 0,
          }}
        />
      </div>
    </>
  );
}

const cubeSize = "50px";

interface RangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (newValue: number) => void;
}

function Range(props: RangeProps) {
  return (
    <div style={{ display: "flex" }}>
      <label>{props.label}</label>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => props.onChange(+e.currentTarget.value)}
      />
      {props.value}
    </div>
  );
}

function createRenderEffect(update: (dt: TimeSpan) => void) {
  let isRendering = true;
  let prevFrameTime = performance.now();

  render();
  onCleanup(() => (isRendering = false));

  function render() {
    const now = performance.now();
    const dt = TimeSpan.fromMilliseconds(now - prevFrameTime);
    prevFrameTime = now;
    update(dt);
    if (isRendering) {
      requestAnimationFrame(render);
    }
  }
}
