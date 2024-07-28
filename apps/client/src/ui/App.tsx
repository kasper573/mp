import { ModuleName, type Area } from "@mp/server";
import { Client } from "colyseus.js";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { env } from "../env";
import { createGame } from "../ecs/Game";

export function App() {
  const client = useMemo(() => new Client(env.serverUrl), []);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const join = useJoinGame(client, container);

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

  return <div ref={setContainer} />;
}

function useJoinGame(client: Client, container: HTMLDivElement | null) {
  const [joinAttemptNumber, rejoin] = useReducer((n) => n + 1, 0);

  const { data: room, ...join } = useQuery({
    queryKey: ["room", joinAttemptNumber],
    queryFn: () => client.joinOrCreate<Area>(ModuleName.area, {}),
  });

  useEffect(() => {
    if (!container || !room) {
      return;
    }

    const game = createGame(room);
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
