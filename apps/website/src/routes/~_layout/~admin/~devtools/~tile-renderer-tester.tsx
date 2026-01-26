import { TileRendererTester } from "@mp/game-client";
import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute(
  "/_layout/admin/devtools/tile-renderer-tester",
)({
  component: TileRendererTester,
});
