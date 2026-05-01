import * as fixtures from "@mp/fixtures";
import { ActorSpriteTester } from "@mp/game-client";
import { createFileRoute } from "@tanstack/react-router";
import { useActorTextures } from "../../../../integrations/assets";

export const Route = createFileRoute("/_layout/admin/devtools/actor-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  const modelIds = fixtures.actorModels.map((m) => m.id);
  return (
    <ActorSpriteTester modelIds={modelIds} actorTextures={useActorTextures()} />
  );
}
