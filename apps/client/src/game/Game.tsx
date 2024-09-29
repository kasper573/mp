import { createQuery } from "@tanstack/solid-query";
import { createMemo, Show } from "solid-js";
import { myCharacter } from "../state/signals";
import { loadAreaResource } from "./loadAreaResource";
import { AreaScene } from "./AreaScene";

export function Game() {
  const areaId = createMemo(() => myCharacter()?.areaId);
  const query = createQuery(() => {
    const id = areaId();
    return {
      queryKey: ["area", id],
      queryFn: () => (id ? loadAreaResource(id) : null),
    };
  });

  return (
    <Show when={query.data} keyed>
      {(data) => <AreaScene area={data} />}
    </Show>
  );
}
