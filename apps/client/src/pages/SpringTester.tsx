import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Spring } from "@mp/engine";
import { TimeSpan } from "@mp/time";

export default function SpringTester() {
  const [autoFlip, setAutoFlip] = createSignal(false);
  const [stiffness, setStiffness] = createSignal(200);
  const [damping, setDamping] = createSignal(40);
  const [mass, setMass] = createSignal(2);
  const [precision, setPrecision] = createSignal(1);
  const [target, setTarget] = createSignal(0);
  const options = createMemo(() => ({
    stiffness: stiffness(),
    damping: damping(),
    mass: mass(),
    precision: precision(),
  }));

  const spring = new Spring(target, options);
  createRenderEffect(spring.update);

  function flipSpringTarget() {
    setTarget((now) => (now ? 0 : 100));
  }

  const toggleAutoFlip = () => setAutoFlip((now) => !now);

  createEffect(() => {
    if (autoFlip() && spring.state() === "settled") {
      flipSpringTarget();
    }
  });

  return (
    <div style={{ padding: "20px" }}>
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
        value={target()}
        onChange={setTarget}
      />

      <button onClick={flipSpringTarget}>Flip Target</button>
      <button onClick={toggleAutoFlip}>
        {autoFlip() ? "Disable auto flip" : "Enable auto flip"}
      </button>
      <pre>
        {JSON.stringify(
          {
            value: spring.value(),
            state: spring.state(),
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
            left: `calc(${spring.value() / 100} * (100% - ${cubeSize}))`,
            top: 0,
          }}
        />
      </div>
    </div>
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
