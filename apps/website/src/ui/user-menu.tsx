import { useContext, Show } from "solid-js";
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
import { NavLink } from "../integrations/router/nav-link";

export function UserMenu() {
  const auth = useContext(AuthContext);

  return (
    <Show
      when={auth.isSignedIn.get()}
      fallback={
        <Button role="link" onClick={() => void auth.redirectToSignIn()}>
          Sign in
        </Button>
      }
    >
      <PopoverRoot>
        <PopoverTrigger as={Button}>{auth.identity.get()?.name}</PopoverTrigger>
        <PopoverPortal>
          <PopoverContent>
            <Card floating>
              <PopoverClose asChild>
                <NavLink to="/character">Character</NavLink>
              </PopoverClose>
              <br />
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
    </Show>
  );
}
