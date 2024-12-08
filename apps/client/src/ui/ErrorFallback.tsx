import { createEffect, Show } from "solid-js";

export function ErrorFallback(error: unknown) {
  createEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  });

  return (
    <>
      <h1>Oops! Something went wrong.</h1>
      <Show when={error}>
        <pre>{error instanceof Error ? error.stack : String(error)}</pre>
      </Show>
    </>
  );
}
