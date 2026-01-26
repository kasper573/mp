import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { ActorSpriteTester } from "@mp/game-client";
import { createQuery } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { useActorTextures } from "../../../../integrations/assets";
import { Show } from "solid-js";

export const Route = createFileRoute("/_layout/admin/devtools/actor-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const qb = useQueryBuilder();
  const queryResult = createQuery(() => qb.queryOptions(query));

  return (
    <Show when={queryResult.data}>
      {(data) => (
        <ActorSpriteTester
          modelIds={data().actorModelIds}
          actorTextures={useActorTextures()}
        />
      )}
    </Show>
  );
}

const query = graphql(`
  query ActorTester {
    actorModelIds
  }
`);
