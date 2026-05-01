import { Button, Card } from "@mp/ui";
import { useComputed } from "@mp/state/react";
import { CharacterRenamedResponse, RenameCharacterRequest } from "@mp/world";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "preact/hooks";
import { AuthBoundary } from "../../ui/auth-boundary";
import { atoms } from "@mp/style";
import { NavLink } from "../../integrations/router/nav-link";
import { useGameStateClient } from "../../integrations/use-game-state-client";
import type { ReactNode } from "preact/compat";

export const Route = createFileRoute("/_layout/character")({
  component: AuthBoundary.wrap(CharacterPage),
});

function CharacterPage() {
  const stateClient = useGameStateClient();
  const myCharacter = useComputed(
    () => stateClient.characterList.value[0],
  ).value;
  const [savedName, setSavedName] = useState<string | undefined>(undefined);

  useEffect(() => {
    const off = stateClient.client.on(CharacterRenamedResponse, (ev) => {
      setSavedName(ev.data.name);
    });
    return off;
  }, [stateClient]);

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
              stateClient.client.emit({
                type: RenameCharacterRequest,
                data: {
                  characterId: myCharacter.id,
                  name: newName,
                },
                source: "local",
                target: "wire",
              });
            }
          }}
        >
          <div>
            <label htmlFor="name">Name</label>
            <input name="name" defaultValue={savedName ?? myCharacter.name} />
          </div>

          <Button type="submit">Save</Button>
        </form>
      </Card>

      {savedName !== undefined && (
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
