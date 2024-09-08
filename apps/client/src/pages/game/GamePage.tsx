import type { DependencyList } from "react";
import { useEffect, useRef, useState } from "react";
import { AreaLoader } from "../../game/AreaLoader";
import { createGame } from "../../game/game";
import { DebugText } from "./DebugText";
import * as styles from "./GamePage.css";

const areaLoader = new AreaLoader();

export default function GamePage() {
  const [resizeTo, setResizeTo] = useState<HTMLDivElement | null>(null);
  const [debugText, setDebugText] = useState("");

  useDisposable(
    () =>
      resizeTo
        ? createGame({
            container: resizeTo,
            resizeTo,
            areaLoader,
            debug: setDebugText,
          })
        : undefined,
    [areaLoader, resizeTo],
  );

  return (
    <div className={styles.container}>
      <div ref={setResizeTo} className={styles.container} />
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
