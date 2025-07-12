import type { ComponentType, JSX, ComponentChildren } from "preact";
import type { RoleDefinition } from "@mp/auth";
import { ioc, ctxAuthClient } from "@mp/game/client";
import { useComputed } from "@mp/state/react";
import PermissionDenied from "../routes/permission-denied";

interface AuthBoundaryProps {
  requiredRoles?: Iterable<RoleDefinition>;
  children?: ComponentChildren;
}

export function AuthBoundary(props: AuthBoundaryProps): JSX.Element {
  const auth = ioc.get(ctxAuthClient);

  const isPermitted = useComputed(() => {
    if (!auth.isSignedIn.value) {
      return false;
    }
    const existingSet = auth.identity.value?.roles ?? new Set();
    const requiredSet = new Set(props.requiredRoles);
    return requiredSet.isSubsetOf(existingSet);
  });

  if (!isPermitted.value) {
    return <PermissionDenied />;
  }
  return <>{props.children}</>;
}

AuthBoundary.wrap = (Component: ComponentType, props?: AuthBoundaryProps) => {
  return () => (
    <AuthBoundary {...props}>
      <Component />
    </AuthBoundary>
  );
};
