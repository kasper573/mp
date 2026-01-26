import { graphql } from "@mp/api-service/client";
import { useQueryBuilder } from "@mp/api-service/client/tanstack-query";
import { ActorSpriteTester } from "@mp/game-client";
import { createQuery } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { useActorTextures } from "../../../../integrations/assets";
import { Show, Suspense } from "solid-js";
import { LoadingSpinner } from "@mp/ui";

export const Route = createFileRoute("/_layout/admin/devtools/actor-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const qb = useQueryBuilder();
  const actorQuery = createQuery(() => qb.queryOptions(query));
  const actorTextures = useActorTextures();

  return (
    <Suspense fallback={<LoadingSpinner debugDescription="actor-tester" />}>
      <Show when={actorQuery.data?.actorModelIds}>
        {(modelIds) => (
          <ActorSpriteTester
            modelIds={modelIds()}
            actorTextures={actorTextures.data}
          />
        )}
      </Show>
    </Suspense>
  );
}

const query = graphql(`
  query ActorTester {
    actorModelIds
  }
`);
