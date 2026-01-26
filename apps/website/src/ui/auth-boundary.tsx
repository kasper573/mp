import type { RoleDefinition } from "@mp/auth";
import { computed } from "@mp/state/solid";
import type { ParentProps, Component, JSX } from "solid-js";
import { useContext, Show } from "solid-js";
import { AuthContext } from "../integrations/contexts";
import PermissionDenied from "../routes/permission-denied";

interface AuthBoundaryProps extends ParentProps {
  requiredRoles?: Iterable<RoleDefinition>;
}

export function AuthBoundary(props: AuthBoundaryProps): JSX.Element {
  const auth = useContext(AuthContext);

  const isPermitted = computed(() => {
    if (!auth?.isSignedIn.get()) {
      return false;
    }
    const existingSet = auth.identity.get()?.roles ?? new Set();
    const requiredSet = new Set(props.requiredRoles);
    return requiredSet.isSubsetOf(existingSet);
  });

  return (
    <Show when={isPermitted.get()} fallback={<PermissionDenied />}>
      {props.children}
    </Show>
  );
}

AuthBoundary.wrap = (
  Component: Component,
  props?: Omit<AuthBoundaryProps, "children">,
) => {
  return () => (
    <AuthBoundary {...props}>
      <Component />
    </AuthBoundary>
  );
};
