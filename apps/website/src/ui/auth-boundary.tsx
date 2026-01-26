import type { RoleDefinition } from "@mp/auth";
import { useComputed } from "@mp/state/solid";
import type { JSX, Component } from "solid-js";
import { useContext, Show } from "solid-js";
import { AuthContext } from "../integrations/contexts";
import PermissionDenied from "../routes/permission-denied";

interface AuthBoundaryProps {
  requiredRoles?: Iterable<RoleDefinition>;
  children?: JSX.Element;
}

export function AuthBoundary(props: AuthBoundaryProps): JSX.Element {
  const auth = useContext(AuthContext);

  const isPermitted = useComputed(() => {
    if (!auth.isSignedIn.get()) {
      return false;
    }
    const existingSet = auth.identity.get()?.roles ?? new Set();
    const requiredSet = new Set(props.requiredRoles);
    return requiredSet.isSubsetOf(existingSet);
  });

  return (
    <Show when={isPermitted()} fallback={<PermissionDenied />}>
      {props.children}
    </Show>
  );
}

AuthBoundary.wrap = (
  Component: Component,
  boundaryProps?: Omit<AuthBoundaryProps, "children">,
) => {
  return () => (
    <AuthBoundary {...boundaryProps}>
      <Component />
    </AuthBoundary>
  );
};
