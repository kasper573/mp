import { useComputedValue } from "@mp/state";
import { skipToken, useQuery } from "@tanstack/react-query";
import { api, myCharacterId } from "../api";
import { loadAreaResource } from "./loadAreaResource";
import { AreaScene } from "./AreaScene";

export function Game() {
  const areaId = useComputedValue(
    () => api.state.value.characters.get(myCharacterId.value!)?.areaId,
  );
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
    return <div>Area not found: {areaId ?? "no area defined"}</div>;
  }

  return <AreaScene area={area} />;
}
