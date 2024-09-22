import { Show } from "solid-js";

export function ErrorFallback(props: { error?: unknown }) {
  return (
    <>
      <h1>Oops! Something went wrong.</h1>
      <Show when={props.error}>
        <pre>{String(props.error)}</pre>
      </Show>
    </>
  );
}
