import { createLazyFileRoute } from "@tanstack/solid-router";
import { AuthContext } from "@mp/auth/client";
import { useNavigate } from "@tanstack/solid-router";
import { createResource, useContext } from "solid-js";

export const Route = createLazyFileRoute("/auth-callback")({
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
