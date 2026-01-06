import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { Button, Card, ErrorFallback } from "@mp/ui";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AuthBoundary } from "../../ui/auth-boundary";
import { atoms } from "@mp/style";
import { NavLink } from "../../integrations/router/nav-link";
import type { ReactNode } from "preact/compat";

export const Route = createFileRoute("/_layout/character")({
  component: AuthBoundary.wrap(CharacterPage),
});

function CharacterPage() {
  const qb = useQueryBuilder();

  const query = useSuspenseQuery(qb.suspenseQueryOptions(myCharacterQuery));

  const save = useMutation(qb.mutationOptions(updateCharacterNameMutation));

  if (!query.data.myCharacter) {
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
            if (newName) {
              save.mutate({ input: { newName: newName.toString() } });
            }
          }}
        >
          <div>
            <label htmlFor="name">Name</label>
            <input name="name" defaultValue={query.data.myCharacter.name} />
            {save.data?.updateMyCharacter.errors?.newName.join(", ")}
          </div>

          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </form>
      </Card>

      {save.isSuccess && !save.data.updateMyCharacter.errors && (
        <Card intent="success">Changes has been saved</Card>
      )}

      {/* Internal server error, just show in case something terrible happens */}
      {save.isError && (
        <Card intent="error">
          <ErrorFallback
            title="Could not update character"
            error={save.error}
          />
        </Card>
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

const myCharacterQuery = graphql(`
  query CharacterPage {
    myCharacter {
      id
      name
    }
  }
`);

const updateCharacterNameMutation = graphql(`
  mutation UpdateCharacterName($input: UpdateMyCharacterInput!) {
    updateMyCharacter(input: $input) {
      errors {
        newName
      }
    }
  }
`);
