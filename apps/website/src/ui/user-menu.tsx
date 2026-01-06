import { useContext } from "preact/hooks";
import { AuthContext } from "../integrations/contexts";
import {
  Button,
  Card,
  Link,
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from "@mp/ui";

export function UserMenu() {
  const auth = useContext(AuthContext);

  if (!auth.isSignedIn.value) {
    return (
      <Button role="link" onClick={() => void auth.redirectToSignIn()}>
        Sign in
      </Button>
    );
  }

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button>{auth.identity.value?.name}</Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent>
          <Card floating>
            <PopoverClose asChild>
              <Link href={auth.getAccountConsoleUrl()}>Account</Link>
            </PopoverClose>
            <br />
            <PopoverClose asChild>
              <Link href="#" onClick={() => void auth.signOutRedirect()}>
                Sign out
              </Link>
            </PopoverClose>
          </Card>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  );
}
