import type { RoleDefinition } from "@mp/auth";
import type { Component, JSX } from "solid-js";
import { createMemo, useContext, Show } from "solid-js";
import { AuthContext } from "../integrations/contexts";
import PermissionDenied from "../routes/permission-denied";

interface AuthBoundaryProps {
  requiredRoles?: Iterable<RoleDefinition>;
  children?: JSX.Element;
}

export function AuthBoundary(props: AuthBoundaryProps): JSX.Element {
  const auth = useContext(AuthContext);

  const isPermitted = createMemo(() => {
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

AuthBoundary.wrap = (Component: Component, props?: AuthBoundaryProps) => {
  return () => (
    <AuthBoundary {...props}>
      <Component />
    </AuthBoundary>
  );
};
