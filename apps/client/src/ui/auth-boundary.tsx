import { AuthContext } from "@mp/auth/client";
import type { Component, JSX, ParentProps } from "solid-js";
import { useContext, Switch, Match, createMemo } from "solid-js";
import type { RoleDefinition } from "@mp/auth";
import PermissionDenied from "../routes/permission-denied";

interface AuthBoundaryProps {
  requiredRoles?: Iterable<RoleDefinition>;
}

export function AuthBoundary(
  props: ParentProps<AuthBoundaryProps>,
): JSX.Element {
  const auth = useContext(AuthContext);

  const isPermitted = createMemo(() => {
    if (!auth.isSignedIn()) {
      return false;
    }
    const existingSet = auth.identity()?.roles ?? new Set();
    const requiredSet = new Set(props.requiredRoles);
    return requiredSet.isSubsetOf(existingSet);
  });

  return (
    <Switch>
      <Match when={isPermitted()}>{props.children}</Match>
      <Match when={!isPermitted()}>
        <PermissionDenied />
      </Match>
    </Switch>
  );
}

AuthBoundary.wrap = (Component: Component, props?: AuthBoundaryProps) => {
  return () => (
    <AuthBoundary {...props}>
      <Component />
    </AuthBoundary>
  );
};
