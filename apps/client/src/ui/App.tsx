import type { CSSProperties } from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createGame } from "../ecs/Game";
import { AreaLoader } from "../ecs/AreaLoader";
import { api } from "../api";

export function App() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const debugTextRef = useRef<HTMLSpanElement>(null);
  const areaLoader = useMemo(() => new AreaLoader(), []);
  const connected = useSyncExternalStore(
    (fn) => api.connected.subscribe(fn),
    () => api.connected.value,
  );

  useEffect(() => {
    if (!canvas || !connected) {
      return;
    }

    renderDebugText("");
    const game = createGame(areaLoader, renderDebugText);
    game.init({ canvas });
    return () => game.dispose();
  }, [canvas, connected]);

  function renderDebugText(text: string) {
    if (debugTextRef.current) {
      debugTextRef.current.innerText = text;
      debugTextRef.current.style.display = text ? "block" : "none";
    }
  }

  return (
    <>
      <canvas ref={setCanvas} />
      {!connected && <div>Connecting...</div>}
      <span style={styles.debugText} ref={debugTextRef} />
    </>
  );
}

const styles = {
  debugText: {
    position: "absolute",
    top: 8,
    left: 8,
    background: "rgba(0, 0, 0, 0.5)",
    color: "white",
    padding: "8px",
    borderRadius: "8px",
    pointerEvents: "none",
  },
} satisfies Record<string, CSSProperties>;
