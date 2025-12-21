import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { ActorSpriteTester } from "@mp/game-client";
import { useSuspenseQuery } from "@mp/query";
import { createFileRoute } from "@tanstack/react-router";
import { useActorTextures } from "../../../../integrations/assets";

export const Route = createFileRoute("/_layout/admin/devtools/actor-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const qb = useQueryBuilder();
  const {
    data: { actorModelIds },
  } = useSuspenseQuery(qb.suspenseQueryOptions(query));

  return (
    <ActorSpriteTester
      modelIds={actorModelIds}
      actorTextures={useActorTextures()}
    />
  );
}

const query = graphql(`
  query ActorTester {
    actorModelIds
  }
`);
