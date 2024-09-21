import { computed, useSignal } from "@mp/state";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Scene } from "@mp/pixi/react";
import { api, myCharacterId } from "../api";
import { createScene } from "./AreaScene";
import { loadAreaResource } from "./loadAreaResource";

export interface GameProps {
  setDebugText: (text: string) => void;
}

const myAreaId = computed(
  () => api.state.value.characters.get(myCharacterId.value!)?.areaId,
);

export function Game({ setDebugText }: GameProps) {
  const [areaId] = useSignal(myAreaId);
  const {
    data: area,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["area", areaId],
    queryFn: areaId ? () => loadAreaResource(areaId) : skipToken,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Error: {error.message}</div>;
  }
  if (!area) {
    return <div>Area not found</div>;
  }

  return <Scene create={createScene} dependencies={[area, setDebugText]} />;
}
