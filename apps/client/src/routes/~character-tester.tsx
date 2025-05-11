import { CharacterTester } from "@mp/game/client";
import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/character-tester")({
  component: CharacterTester,
});
