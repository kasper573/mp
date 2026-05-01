import { Button, Card } from "@mp/ui";
import { renameCharacter } from "@mp/world";
import { useComputed, useSignal } from "@mp/state/react";
import { useEffect } from "preact/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { atoms } from "@mp/style";
import { NavLink } from "../../integrations/router/nav-link";
import { useRiftClient } from "../../integrations/use-rift-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import type { ReactNode } from "preact/compat";

export const Route = createFileRoute("/_layout/character")({
  component: AuthBoundary.wrap(CharacterPage),
});

function CharacterPage() {
  const { client, characters } = useRiftClient(() => undefined);
  const myCharacter = useComputed(() => characters.characters.value[0]).value;
  const savedAt = useSignal<number | undefined>(undefined);

  useEffect(() => {
    return characters.characters.subscribe(() => {
      savedAt.value = Date.now();
    });
  }, [characters, savedAt]);

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
