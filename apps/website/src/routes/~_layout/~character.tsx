import type { AccessToken } from "@mp/auth";
import { Button, Card } from "@mp/ui";
import {
  CharacterRenamedResponse,
  MpRiftClient,
  ownedCharacters,
  renameCharacter,
} from "@mp/world";
import {
  useComputed,
  useDisposable,
  useMount,
  useSignal,
} from "@mp/state/react";
import { createFileRoute } from "@tanstack/react-router";
import { useContext } from "preact/hooks";
import { atoms } from "@mp/style";
import { AuthContext } from "../../integrations/contexts";
import { env } from "../../env";
import { NavLink } from "../../integrations/router/nav-link";
import { AuthBoundary } from "../../ui/auth-boundary";
import type { ReactNode } from "preact/compat";

export const Route = createFileRoute("/_layout/character")({
  component: AuthBoundary.wrap(CharacterPage),
});

function createClient(accessToken: AccessToken | undefined): MpRiftClient {
  return new MpRiftClient({ url: env.gameServerUrl, accessToken });
}

function CharacterPage() {
  const auth = useContext(AuthContext);
  const client = useDisposable(createClient, [auth.identity.value?.token]);

  const myCharacter = useComputed(
    () => ownedCharacters(client.world).value[0],
  ).value;
  const savedAt = useSignal<number | undefined>(undefined);

  useMount(() =>
    client.on(CharacterRenamedResponse, () => {
      savedAt.value = Date.now();
    }),
  );

  if (!myCharacter) {
    return (
      <Container>
        You have no character. <NavLink to="/play">Start playing</NavLink> to
        create a character.
      </Container>
    );
  }

  return (
    <Container>
      <Card className={atoms({ mb: "l" })}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const newName = new FormData(e.currentTarget).get("name");
            if (typeof newName === "string" && newName) {
              renameCharacter(client, myCharacter.id, newName);
            }
          }}
        >
          <div>
            <label htmlFor="name">Name</label>
            <input name="name" defaultValue={myCharacter.name} />
          </div>

          <Button type="submit">Save</Button>
        </form>
      </Card>

      {savedAt.value !== undefined && (
        <Card intent="success">Changes have been saved</Card>
      )}
    </Container>
  );
}

function Container({ children }: { children?: ReactNode }) {
  return (
    <div style={{ maxWidth: 600 }} className={atoms({ mx: "l" })}>
      <h1>Character</h1>
      {children}
    </div>
  );
}
