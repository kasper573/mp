import { ActorSpriteTester } from "@mp/game/client";
import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/actor-tester")({
  component: ActorSpriteTester,
});
