import { ActorSpriteTester } from "@mp/game/client";
import { createFileRoute } from "@tanstack/react-router";
import { useActorSpritesheets } from "../../../../integrations/assets";

export const Route = createFileRoute("/_layout/admin/devtools/actor-tester")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ActorSpriteTester spritesheets={useActorSpritesheets()} />;
}
