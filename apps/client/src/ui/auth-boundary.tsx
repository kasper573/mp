import type { Component, JSX, ParentProps } from "solid-js";
import { Switch, Match, createMemo } from "solid-js";
import type { RoleDefinition } from "@mp/auth";
import { ioc, ctxAuthClient } from "@mp/game/client";
import PermissionDenied from "../routes/permission-denied";

interface AuthBoundaryProps {
  requiredRoles?: Iterable<RoleDefinition>;
}

export function AuthBoundary(
  props: ParentProps<AuthBoundaryProps>,
): JSX.Element {
  const auth = ioc.get(ctxAuthClient);

  const isPermitted = createMemo(() => {
    if (!auth.isSignedIn.get()) {
      return false;
    }
    const existingSet = auth.identity.get()?.roles ?? new Set();
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
