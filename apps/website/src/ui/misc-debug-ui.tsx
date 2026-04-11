import { StorageSignal } from "@mp/state";
import { Checkbox } from "@mp/ui";

import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { useQuery } from "@tanstack/react-query";
import { env } from "../env";

const pingEnabledSignal = new StorageSignal("local", "pingEnabled", true);

export function MiscDebugUi() {
  const qb = useQueryBuilder();
  const { data } = useQuery(qb.queryOptions(serverSettings));

  return (
    <>
      <div>Client version: {env.version}</div>
      <div>Server version: {data?.serverVersion ?? "unknown"}</div>
      <label>
        Show ping <Checkbox signal={pingEnabledSignal} />{" "}
        {pingEnabledSignal.value ? <PingIndicator /> : null}
      </label>
    </>
  );
}

function PingIndicator() {
  const ping = useQuery({
    queryKey: ["ping"],
    async queryFn() {
      const start = performance.now();
      await fetch(`${env.api.url}/health`);
      return performance.now() - start;
    },
    refetchInterval: 5000,
    initialData: 0,
  });

  return <>{ping.data.toFixed(2)} ms</>;
}

const serverSettings = graphql(`
  query MiscDebugUi {
    serverVersion
  }
`);
