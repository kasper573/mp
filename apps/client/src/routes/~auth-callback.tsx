import type { UseNavigateResult } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ctxAuthClient, ioc } from "@mp/game/client";
import type { AuthClient } from "@mp/auth/client";

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

  useEffect(() => {
    void handleAuthCallback(auth, navigate);
  }, [auth, navigate]);

  return null;
}

async function handleAuthCallback(
  auth: AuthClient,
  navigate: UseNavigateResult<string>,
) {
  try {
    const state = await auth.signInCallback();
    void navigate({ to: state?.returnUrl ?? "/" });
  } catch {
    // If visiting the callback URL without a sign-in attempt
    void navigate({ to: "/" });
  }
}
