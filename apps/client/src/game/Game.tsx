import { skipToken, createQuery } from "@tanstack/solid-query";
import { createMemo, ErrorBoundary, Suspense } from "solid-js";
import { myCharacter } from "../api";
import { ErrorFallback } from "../components/ErrorFallback";
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

  return (
    <ErrorBoundary
      fallback={(error: unknown) => <ErrorFallback error={error} />}
    >
      <Suspense fallback={<>Loading...</>}>
        {query.data && <AreaScene area={query.data} />}
      </Suspense>
    </ErrorBoundary>
  );
}
