import { ParticleTester } from "@mp/game/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/admin/devtools/particle-tester")(
  {
    component: ParticleTester,
  },
);
