import { actorModelIds } from "@mp/fixtures";
import { ActorSpriteTester } from "@mp/world";
import { createFileRoute } from "@tanstack/react-router";
import { useActorTextures } from "../../../../integrations/assets";

export const Route = createFileRoute("/_layout/admin/devtools/actor-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ActorSpriteTester
      modelIds={[...actorModelIds]}
      actorTextures={useActorTextures()}
    />
  );
}
