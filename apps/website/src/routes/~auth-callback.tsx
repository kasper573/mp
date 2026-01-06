import type { AuthClient } from "@mp/auth/client";
import type { UseNavigateResult } from "@tanstack/react-router";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useContext, useEffect } from "preact/hooks";
import { AuthContext } from "../integrations/contexts";

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
  const auth = useContext(AuthContext);

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
