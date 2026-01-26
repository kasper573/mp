import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { Button, Card, ErrorFallback } from "@mp/ui";
import { createMutation, createQuery } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { AuthBoundary } from "../../ui/auth-boundary";
import { atoms } from "@mp/style";
import { NavLink } from "../../integrations/router/nav-link";
import type { JSX } from "solid-js";
import { Show } from "solid-js";

export const Route = createFileRoute("/_layout/character")({
  component: AuthBoundary.wrap(CharacterPage),
});

function CharacterPage() {
  const qb = useQueryBuilder();

  const query = createQuery(() => qb.queryOptions(myCharacterQuery));

  const save = createMutation(() => qb.mutationOptions(updateCharacterNameMutation));

  return (
    <Show
      when={query.data?.myCharacter}
      fallback={
        <Container>
          You have no character. <NavLink to="/play">Start playing</NavLink> to
          create a character.
        </Container>
      }
    >
      {(character) => (
        <Container>
          <Card class={atoms({ mb: "l" })}>
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
                <label for="name">Name</label>
                <input name="name" value={character().name} />
                {save.data?.updateMyCharacter.errors?.newName.join(", ")}
              </div>

              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Save"}
              </Button>
            </form>
          </Card>

          <Show when={save.isSuccess && !save.data?.updateMyCharacter.errors}>
            <Card intent="success">Changes have been saved</Card>
          </Show>

          {/* Internal server error, just show in case something terrible happens */}
          <Show when={save.error}>
            {(error) => (
              <Card intent="error">
                <ErrorFallback
                  title="Could not update character"
                  error={error()}
                />
              </Card>
            )}
          </Show>
        </Container>
      )}
    </Show>
  );
}

function Container(props: { children?: JSX.Element }) {
  return (
    <div style={{ "max-width": "600px" }} class={atoms({ mx: "l" })}>
      <h1>Character</h1>
      {props.children}
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
