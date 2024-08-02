import { ModuleName, type WorldState } from "@mp/server";
import { Client } from "colyseus.js";
import type { CSSProperties, RefObject } from "react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { env } from "../env";
import { createGame } from "../ecs/Game";
import { AreaLoader } from "../ecs/AreaLoader";

export function App() {
  const client = useMemo(() => new Client(env.serverUrl), []);
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const debugTextRef = useRef<HTMLSpanElement>(null);
  const join = useJoinGame(client, canvasContainer, debugTextRef);

  if (join.isLoading) {
    return <>Loading...</>;
  }

  if (join.error) {
    return (
      <>
        Could not connect to server: {join.error?.message}
        <button onClick={() => join.refetch()}>Try again</button>
      </>
    );
  }

  return (
    <>
      <div ref={setCanvasContainer} />
      <span style={styles.debugText} ref={debugTextRef} />
    </>
  );
}

function useJoinGame(
  client: Client,
  container: HTMLDivElement | null,
  debugText: RefObject<HTMLSpanElement>,
) {
  const [joinAttemptNumber, rejoin] = useReducer((n) => n + 1, 0);
  const areaLoader = new AreaLoader();

  const { data: room, ...join } = useQuery({
    queryKey: ["room", joinAttemptNumber],
    queryFn: () => client.joinOrCreate<WorldState>(ModuleName.world, {}),
  });

  useEffect(() => {
    if (!container || !room || !debugText) {
      return;
    }

    function renderDebugText(text: string) {
      if (debugText.current) {
        debugText.current.innerText = text;
        debugText.current.style.display = text ? "block" : "none";
      }
    }

    const game = createGame(room, areaLoader, renderDebugText);
    container.appendChild(game.canvas);
    game.start();
    return () => game.dispose();
  }, [container, room]);

  useEffect(() => {
    room?.onLeave(rejoin);
    return () => {
      room?.leave();
    };
  }, [room]);

  return join;
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
