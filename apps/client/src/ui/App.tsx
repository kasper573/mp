import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createGame } from "../ecs/Game";
import { AreaLoader } from "../ecs/AreaLoader";

export function App() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const debugTextRef = useRef<HTMLSpanElement>(null);
  const areaLoader = useMemo(() => new AreaLoader(), []);

  useEffect(() => {
    if (!container) {
      return;
    }

    const game = createGame(areaLoader, renderDebugText);
    container.appendChild(game.canvas);
    game.start();
    return () => game.dispose();
  }, [container]);

  function renderDebugText(text: string) {
    if (debugTextRef.current) {
      debugTextRef.current.innerText = text;
      debugTextRef.current.style.display = text ? "block" : "none";
    }
  }

  return (
    <>
      <div ref={setContainer} />
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
