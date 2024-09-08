import type { DependencyList } from "react";
import { useEffect, useRef, useState } from "react";
import { AreaLoader } from "../../game/AreaLoader";
import { createGame } from "../../game/game";
import { DebugText } from "./DebugText";
import * as styles from "./GamePage.css";

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
    <div className={styles.container}>
      <div ref={setContainer} className={styles.container} />
      <DebugText debugText={debugText} />
    </div>
  );
}

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
