import type { JSX } from "react";
import { Suspense, useEffect } from "react";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { skipToken, useQuery } from "@mp/rpc/react";
import {
  ctxGameStateClient,
  type GameStateClient,
} from "../game-state/game-state-client";
import { useAreaResource } from "../area/use-area-resource";
import {
  ctxActorSpritesheetLookup,
  loadActorSpritesheets,
} from "../actor/actor-spritesheet-lookup";
import { ctxGameRpcClient } from "../game-rpc-client";
import { ioc } from "../context/ioc";
import { GameRenderer } from "./game-renderer";

export interface GameClientProps {
  stateClient: GameStateClient;
  interactive: boolean;
  additionalDebugUi?: JSX.Element;
}

/**
 * A wrapper of `GameRenderer` that handles all async state loading and state management.
 * This allows the `GameRenderer` to focus on rendering the game, while this component
 * can focus on the data fetching and state management.
 */
export function GameClient(props: GameClientProps) {
  const rpc = ioc.get(ctxGameRpcClient);

  const areaId = props.stateClient.areaId.value;
  const area = useAreaResource(areaId);
  const areaSpritesheets = useQuery({
    queryKey: ["areaSpritesheets", area.data?.id],
    staleTime: Infinity,
    queryFn: area.data
      ? () => loadTiledMapSpritesheets(area.data.tiled.map)
      : skipToken,
  });

  const { data: actorSpritesheets } =
    rpc.area.actorSpritesheetUrls.useSuspenseQuery({
      input: void 0,
      map: loadActorSpritesheets,
      staleTime: Infinity,
    });

  useEffect(
    () => ioc.register(ctxGameStateClient, props.stateClient),
    [props.stateClient],
  );

  useEffect(
    () => ioc.register(ctxActorSpritesheetLookup, actorSpritesheets),
    [actorSpritesheets],
  );

  if (!props.stateClient.isConnected.value) {
    return <LoadingSpinner>Connecting to game server</LoadingSpinner>;
  }

  if (!areaId) {
    return <LoadingSpinner>Connecting to game server</LoadingSpinner>;
  }

  if (area.isLoading || areaSpritesheets.isLoading) {
    return <LoadingSpinner>Loading area</LoadingSpinner>;
  }

  if (!area.data || !areaSpritesheets.data) {
    return (
      <ErrorFallback
        error="Could not load area data"
        reset={() => void area.refetch()}
      />
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner>Loading renderer</LoadingSpinner>}>
      <GameRenderer
        interactive={props.interactive}
        gameState={props.stateClient.gameState}
        additionalDebugUi={props.additionalDebugUi}
        areaSceneOptions={{
          area: area.data,
          spritesheets: areaSpritesheets.data,
        }}
      />
    </Suspense>
  );
}
