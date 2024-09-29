import { skipToken, createQuery } from "@tanstack/solid-query";
import { createMemo } from "solid-js";
import { myCharacter } from "../state/signals";
import { loadAreaResource } from "./loadAreaResource";
import { AreaScene } from "./AreaScene";

export function Game() {
  const areaId = createMemo(() => myCharacter()?.areaId);
  const query = createQuery(() => {
    const id = areaId();
    return {
      queryKey: ["area", id],
      queryFn: id ? () => loadAreaResource(id) : skipToken,
    };
  });

  return <>{query.data && <AreaScene area={query.data} />}</>;
}
