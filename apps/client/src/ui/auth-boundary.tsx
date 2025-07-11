import type { ComponentType, JSX, ReactNode } from "react";
import { useMemo } from "react";
import type { RoleDefinition } from "@mp/auth";
import { ioc, ctxAuthClient } from "@mp/game/client";
import { useObservable } from "@mp/state/react";
import PermissionDenied from "../routes/permission-denied";

interface AuthBoundaryProps {
  requiredRoles?: Iterable<RoleDefinition>;
  children?: ReactNode;
}

export function AuthBoundary(props: AuthBoundaryProps): JSX.Element {
  const auth = ioc.get(ctxAuthClient);
  const identity = useObservable(auth.identity);
  const isSignedIn = useObservable(auth.isSignedIn);

  const isPermitted = useMemo(() => {
    if (!isSignedIn) {
      return false;
    }
    const existingSet = identity?.roles ?? new Set();
    const requiredSet = new Set(props.requiredRoles);
    return requiredSet.isSubsetOf(existingSet);
  }, [identity, isSignedIn, props.requiredRoles]);

  if (!isPermitted) {
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
