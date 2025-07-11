import { ioc, ctxAuthClient } from "@mp/game/client";
import { useObservable } from "@mp/state/react";
import { Button } from "@mp/ui";

export default function PermissionDenied() {
  const auth = ioc.get(ctxAuthClient);
  const isSignedIn = useObservable(auth.isSignedIn);

  return (
    <div
      style={{
        position: "absolute",
        top: "128px",
        left: 0,
        right: 0,
        textAlign: "center",
      }}
    >
      {isSignedIn ? (
        <>
          <h1>Permission Denied</h1>
          <p>
            Your account does not have the required permissions to access this
            page.
          </p>
        </>
      ) : (
        <>
          <h1>Permission Denied</h1>
          <p>You must be signed in to access this page.</p>
          <Button onClick={() => void auth.redirectToSignIn()}>Sign in</Button>
        </>
      )}
    </div>
  );
}
