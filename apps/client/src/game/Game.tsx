import { skipToken, createQuery } from "@tanstack/solid-query";
import { api, myCharacter, myCharacterId } from "../api";
import { loadAreaResource } from "./loadAreaResource";
import { AreaScene } from "./AreaScene";
import { createMemo } from "solid-js/types/server/reactive.js";

export function Game() {
  const areaId = createMemo(() => myCharacter()?.areaId);
  const query = createQuery(() => {
    const id = areaId();
    return {
      queryKey: ["area", id],
      queryFn: id ? () => loadAreaResource(id) : skipToken,
    };
  });

  if (query.isLoading) {
    return <div>Loading...</div>;
  }
  if (query.error) {
    return <div>Error: {query.error.message}</div>;
  }
  if (!query.data) {
    return <div>Area not found: {areaId() ?? "no area defined"}</div>;
  }

  return <AreaScene area={query.data} />;
}
