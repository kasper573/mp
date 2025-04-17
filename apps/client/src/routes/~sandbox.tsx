import { createFileRoute } from "@tanstack/solid-router";
import {
  createSignal,
  createMemo,
  onCleanup,
  createEffect,
  Show,
} from "solid-js";
import { Spring } from "@mp/engine";
import { TimeSpan } from "@mp/time";
import { ErrorToString } from "@mp/ui";
import { skipToken } from "@mp/rpc";
import { useRpc } from "../integrations/rpc";

export const Route = createFileRoute("/sandbox")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div style={{ padding: "20px" }}>
      <ErrorTester />
      <SpringTester />
    </div>
  );
}

function ErrorTester() {
  const rpc = useRpc();
  const [uiError, setUIError] = createSignal(false);
  const [rpcError, setRpcError] = createSignal(false);
  const [errorBoundary, setErrorBoundary] = createSignal(false);

  const query = rpc.system.testError.useQuery(() => ({
    input: rpcError() ? void 0 : skipToken,
    throwOnError: errorBoundary(),
  }));

  return (
    <div>
      <h1>Error Tester</h1>
      <button onClick={() => setUIError(true)}>Trigger UI error</button>
      <div>
        <button disabled={rpcError()} onClick={() => setRpcError(true)}>
          Trigger RPC error
        </button>
        <label>
          <input
            type="checkbox"
            checked={errorBoundary()}
            disabled={rpcError()}
            onChange={(e) => setErrorBoundary(e.currentTarget.checked)}
          />
          Use error boundary
        </label>
      </div>
      <Show when={!errorBoundary() && query.error}>
        <pre>
          <ErrorToString error={query.error} />
        </pre>
      </Show>
      {uiError() && <ForcedError />}
    </div>
  );
}

function ForcedError() {
  throw new Error("This is a test error that was thrown in the UI");
  return null;
}

function SpringTester() {
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
