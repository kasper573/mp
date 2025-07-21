import type { GameAssetLoader } from "@mp/game/client";
import { loadAreaResource } from "@mp/game/client";
import { loadActorSpritesheets } from "@mp/game/server";
import { useContext } from "preact/hooks";
import { RpcClientContext } from "./rpc";
import { useSuspenseQuery } from "@mp/rpc/react";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";

export const useGameAssets: GameAssetLoader = (areaId) => {
  const rpc = useContext(RpcClientContext);

  const { data: actorSpritesheets } =
    rpc.system.actorSpritesheetUrls.useSuspenseQuery({
      input: void 0,
      map: loadActorSpritesheets,
    });

  const { data: area } = rpc.system.areaFileUrl.useSuspenseQuery({
    input: areaId,
    staleTime: Infinity,
    map: loadAreaResource,
  });

  const { data: areaSpritesheets } = useSuspenseQuery({
    queryKey: ["areaSpritesheets", areaId],
    staleTime: Infinity,
    queryFn: () => loadTiledMapSpritesheets(area.tiled.map),
  });

  return {
    area,
    actorSpritesheets,
    areaSpritesheets,
  };
};
