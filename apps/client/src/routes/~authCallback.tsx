import { createFileRoute } from "@tanstack/solid-router";
import { AuthContext } from "@mp/auth/client";
import { useNavigate } from "@tanstack/solid-router";
import { createResource, useContext } from "solid-js";

export const Route = createFileRoute("/authCallback")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);

  createResource(async () => {
    try {
      await auth.signInCallback();
      void navigate({ to: "/play" });
    } catch {
      void navigate({ to: "/" });
    }
  });

  return null;
}
