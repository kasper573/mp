import type { Query, QueryCache } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "preact/hooks";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";

/**
 * Emulates deterministic flavorful file names for the current pending queries
 */
export function PendingQueriesDescription() {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();
  const [pendingQueries, setPendingQueries] = useState(() =>
    getPendingQueries(cache),
  );

  useEffect(
    () => cache.subscribe(() => setPendingQueries(getPendingQueries(cache))),
    [cache],
  );

  return ellipsis(pendingQueries.map(emulateFileName).join(", "), 200);
}

function emulateFileName(query: Query): string {
  const baseName = uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: "-",
    length: 3,
    seed: query.queryHash,
  });
  const fileType = uniqueNamesGenerator({
    dictionaries: [fileTypes],
    length: 1,
    seed: query.queryHash,
  });
  return `${baseName}.${fileType}`;
}

function getPendingQueries(cache: QueryCache) {
  return cache
    .getAll()
    .filter((query) => query.state.fetchStatus === "fetching");
}

const fileTypes = ["ico", "png", "jpg", "wav", "ogg"];

function ellipsis(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + "...";
}
