import type { CSSProperties, DependencyList } from "react";
import { useEffect, useRef, useState } from "react";
import { AreaLoader } from "../../game/AreaLoader";
import { createGame } from "../../game/game";
import { DebugText } from "./DebugText";

const areaLoader = new AreaLoader();

export default function GamePage() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [debugText, setDebugText] = useState("");

  useDisposable(() => {
    if (container) {
      const game = createGame(areaLoader, setDebugText);
      void game.init({ container, resizeTo: container });
      return game;
    }
  }, [areaLoader, container]);

  return (
    <>
      <div ref={setContainer} style={styles.container} />
      <DebugText debugText={debugText} />
    </>
  );
}

const styles = {
  container: {
    width: "100%",
    height: "100%",
  },
} satisfies Record<string, CSSProperties>;

interface Disposable {
  dispose(): void;
}

function useDisposable<T extends Disposable>(
  createDisposable: () => T | undefined,
  dependencyList: DependencyList,
): void {
  const currentRef = useRef<T>();
  useEffect(() => {
    const d = createDisposable();
    currentRef.current = d;
    return () => d?.dispose();
  }, dependencyList);
}
