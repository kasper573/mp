import { useApi } from "@mp/api-service/sdk";
import { ActorSpriteTester } from "@mp/game-client";
import { useSuspenseQuery } from "@mp/query";
import { createFileRoute } from "@tanstack/react-router";
import { useActorTextures } from "../../../../integrations/assets";

export const Route = createFileRoute("/_layout/admin/devtools/actor-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const api = useApi();
  const { data: modelIds } = useSuspenseQuery(api.actorModelIds.queryOptions());

  return (
    <ActorSpriteTester modelIds={modelIds} actorTextures={useActorTextures()} />
  );
}
