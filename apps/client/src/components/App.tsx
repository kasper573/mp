import type { Area } from "@mp/server";
import { Client } from "colyseus.js";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { env } from "../env";
import { createGame } from "../entities/Game";

export function App() {
  const client = useMemo(() => new Client(env.serverUrl), []);
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const join = useJoinServer(client, canvasContainer);

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

  return <div ref={setCanvasContainer} />;
}

function useJoinServer(client: Client, canvasContainer: HTMLDivElement | null) {
  const [joinAttemptNumber, rejoin] = useReducer((n) => n + 1, 0);

  const { data: room, ...join } = useQuery({
    queryKey: ["room", joinAttemptNumber],
    queryFn: () => client.joinOrCreate<Area>("test_room", {}),
  });

  useEffect(() => {
    if (!canvasContainer || !room) {
      return;
    }

    const game = createGame(room);
    canvasContainer.appendChild(game.canvas);
    game.start();
    return () => game.dispose();
  }, [canvasContainer, room]);

  useEffect(() => {
    room?.onLeave(rejoin);
    return () => {
      room?.leave();
    };
  }, [room]);

  return join;
}
