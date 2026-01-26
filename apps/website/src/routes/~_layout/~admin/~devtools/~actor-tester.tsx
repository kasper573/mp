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
  const query = createQuery(() => qb.suspenseQueryOptions(actorQuery));
  const actorTextures = useActorTextures();

  return (
    <Show
      when={
        query.data && actorTextures
          ? { data: query.data, textures: actorTextures }
          : undefined
      }
    >
      {(props) => (
        <ActorSpriteTester
          modelIds={props().data.actorModelIds}
          actorTextures={props().textures}
        />
      )}
    </Show>
  );
}

const actorQuery = graphql(`
  query ActorTester {
    actorModelIds
  }
`);
