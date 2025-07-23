import type { GameAssetLoader } from "@mp/game/client";
import { loadAreaResource } from "@mp/game/client";
import type {
  ActorSpritesheetLookup,
  AreaId,
  AreaResource,
} from "@mp/game/client";
import { loadActorSpritesheets } from "@mp/game/client";
import { useContext } from "preact/hooks";
import { RpcClientContext } from "./rpc";
import { useSuspenseQuery } from "@mp/query";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";

export const useGameAssets: GameAssetLoader = (areaId) => {
  const area = useAreaResource(areaId);
  return {
    area,
    areaSpritesheets: useAreaSpritesheets(area),
    actorSpritesheets: useActorSpritesheets(),
  };
};

export function useActorSpritesheets(): ActorSpritesheetLookup {
  const rpc = useContext(RpcClientContext);
  const query = rpc.system.actorSpritesheetUrls.useSuspenseQuery({
    input: void 0,
    map: loadActorSpritesheets,
  });

  return query.data;
}

export function useAreaResource(areaId: AreaId): AreaResource {
  const rpc = useContext(RpcClientContext);
  const query = rpc.system.areaFileUrl.useSuspenseQuery({
    input: areaId,
    staleTime: Infinity,
    map: loadAreaResource,
  });
  return query.data;
}

export function useAreaSpritesheets(
  area: AreaResource,
): TiledSpritesheetRecord {
  const query = useSuspenseQuery({
    queryKey: ["areaSpritesheets", area.id],
    staleTime: Infinity,
    queryFn: () => loadTiledMapSpritesheets(area.tiled.map),
  });
  return query.data;
}
