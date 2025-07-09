import { createFileRoute } from "@tanstack/solid-router";
import { useNavigate } from "@tanstack/solid-router";
import { createResource } from "solid-js";
import { ctxAuthClient, ioc } from "@mp/game/client";

/**
 * The auth callback route is intentionally placed outside the layout.
 * This ensures that it's impossible to navigate in ie. the main menu
 * until the auth-callback has finished processing and redirected to
 * the appropriate page.
 *
 * This mostly applies to helping e2e tests avoiding flaky behavior,
 * but technically it could also happen to real users.
 */

export const Route = createFileRoute("/auth-callback")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const auth = ioc.get(ctxAuthClient);

  createResource(async () => {
    try {
      const state = await auth.signInCallback();
      void navigate({ to: state?.returnUrl ?? "/" });
    } catch {
      // If visiting the callback URL without a sign-in attempt
      void navigate({ to: "/" });
    }
  });

  return null;
}
